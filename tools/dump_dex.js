/**
 * 彩经趋势（cn.com.rhinoceros）frida 脱壳脚本
 * ============================================================
 * 背景：APK 仅 1 个 84KB 壳 dex（无业务类），真实业务 dex 被加密
 * 存放在 assets/d629bc87…/d/*.c7f9d44a 分片，运行时由
 * libEncryptorP.so 解密、经 InMemoryDexClassLoader / DexClassLoader
 * 加载进内存。本脚本三路兜底：
 *   1. hook InMemoryDexClassLoader（内存 ByteBuffer 里的 dex）
 *   2. hook DexClassLoader（解密落盘后再加载的 dex，记日志）
 *   3. 定时全内存扫描 dex 魔数（任何方式加载的都逃不掉）
 *
 * 使用（Termux 同机方案 / USB 连电脑均可）：
 *   # Termux:
 *   pkg install python -y && pip install frida-tools
 *   # 下载与 frida-tools 匹配的 frida-server-…-android-arm64 到 /data/local/tmp
 *   su -c '/data/local/tmp/frida-server &'   # root shell
 *   # 下载 frida-server 后用 --version 对齐版本，避免协议不匹配
 *   frida -U -f cn.com.rhinoceros -l dump_dex.js
 *   # （同机无 USB 时）frida -H 127.0.0.1:27042 -f cn.com.rhinoceros -l dump_dex.js
 *
 * 结果：/data/data/cn.com.rhinoceros/cache/dexdump/*.dex
 * 用 MT 管理器（root）取出 → 交给 jadx 反编译。
 * ============================================================
 */
'use strict';

var OUT_DIR = '/data/data/cn.com.rhinoceros/cache/dexdump';
var DEX_MAGIC = '64 65 78 0a 30 33 35 00'; // "dex\n035\0"（035/036/037 都以 035 起头可再放宽）
var dumped = {}; // 去重指纹 → true

function log(s) {
  console.log('[' + new Date().toISOString().slice(11, 23) + '] ' + s);
}

function isDex(u8) {
  return u8.length > 1120 && u8[0] === 0x64 && u8[1] === 0x65 && u8[2] === 0x78 && u8[3] === 0x0a;
}

/** 保存一段内存为 .dex 文件（带去重与合法性校验） */
function saveDex(bytes, tag) {
  try {
    var u8 = new Uint8Array(bytes);
    if (!isDex(u8)) return false;
    var size = u8.length;
    // 指纹：size + 头部每 8 字节取样
    var fp = size + '_';
    for (var i = 0; i < 8; i++) fp += u8[i * 4].toString(16);
    if (dumped[fp]) return false;
    dumped[fp] = true;
    var path = OUT_DIR + '/' + tag + '_' + fp + '.dex';
    var f = new File(path, 'wb');
    f.write(bytes);
    f.flush();
    f.close();
    log('DUMPED -> ' + path + '  (' + size + ' bytes)');
    return true;
  } catch (e) {
    log('saveDex fail: ' + e);
    return false;
  }
}

/** 从 DirectByteBuffer dump（InMemoryDexClassLoader 参数） */
function dumpByteBuffer(bb) {
  try {
    var DBB = Java.use('sun.nio.ch.DirectBuffer');
    var d = Java.cast(bb, DBB);
    var addr = ptr(d.address());
    var size = bb.capacity(); // capacity 含完整 buffer；header 校验会过滤垃圾
    var bytes = Memory.readByteArray(addr, size);
    saveDex(bytes, 'inmem');
  } catch (e) {
    // 堆内 ByteBuffer：退化为逐段读
    try {
      var rem = bb.remaining();
      if (rem < 1120 || rem > 200 * 1024 * 1024) return;
      var arr = Java.array('byte', Array.apply(null, new Array(rem)).map(function () { return 0; }));
      var old = bb.position(); bb.position(0);
      bb.get(arr);
      bb.position(old);
      saveDex(new Uint8Array(arr).buffer, 'inmem');
    } catch (e2) { log('dumpByteBuffer fail: ' + e2); }
  }
}

function ensureOutDir() {
  try {
    var app = Java.use('android.app.ActivityThread').currentApplication();
    if (app === null) return false;
    var dir = app.getApplicationContext().getCacheDir().getAbsolutePath() + '/dexdump';
    var df = Java.use('java.io.File').$new(dir);
    if (!df.exists()) df.mkdirs();
    OUT_DIR = dir;
    return true;
  } catch (e) {
    log('ensureOutDir: ' + e);
    return false;
  }
}

Java.perform(function () {
  var ok = ensureOutDir();
  log('out dir = ' + OUT_DIR + (ok ? '' : '（未就绪，扫描阶段会重试）'));

  // ── 1. InMemoryDexClassLoader：全部重载 ──
  try {
    var IMDC = Java.use('dalvik.system.InMemoryDexClassLoader');
    IMDC.$init.overloads.forEach(function (ov) {
      ov.implementation = function () {
        for (var i = 0; i < arguments.length; i++) {
          var a = arguments[i];
          try {
            var cls = a === null || a === undefined ? '' : a.getClass().getName();
            if (cls.indexOf('ByteBuffer') >= 0) {
              dumpByteBuffer(a);
            } else if (cls === '[Ljava.nio.ByteBuffer;') {
              // ByteBuffer[]：逐个 dump
              var arr = Java.cast(a, Java.use('[Ljava.nio.ByteBuffer;'));
              for (var k = 0; k < arr.length; k++) if (arr[k] !== null) dumpByteBuffer(arr[k]);
            }
          } catch (e) {}
        }
        log('InMemoryDexClassLoader.<init> called');
        return ov.apply(this, arguments);
      };
    });
    log('hook InMemoryDexClassLoader OK');
  } catch (e) { log('IMDC hook fail: ' + e); }

  // ── 2. DexClassLoader：解密落盘再加载（记路径，内存扫描兜底 dump） ──
  try {
    var DCL = Java.use('dalvik.system.DexClassLoader');
    DCL.$init.implementation = function (path) {
      log('DexClassLoader path = ' + path);
      return DCL.$init.apply(this, arguments);
    };
    log('hook DexClassLoader OK');
  } catch (e) {}
});

/** 全内存扫描 dex 魔数（兜底，覆盖一切加载方式） */
function memScan() {
  Java.perform(function () {
    if (!ensureOutDir()) return;
    var count = 0;
    Process.enumerateRanges('rw-').forEach(function (r) {
      if (r.size > 768 * 1024 * 1024) return; // 跳过超大段
      try {
        Memory.scanSync(r.base, r.size, DEX_MAGIC).forEach(function (m) {
          try {
            var addr = m.address;
            var size = addr.add(0x20).readU32();          // header.file_size
            if (size < 1120 || size > 200 * 1024 * 1024) return;
            if (addr.add(size) > r.base.add(r.size)) return;
            var sids = addr.add(0x38).readU32();          // header.string_ids_size
            if (sids === 0 || sids > size) return;        // header 副本误报过滤
            var bytes = Memory.readByteArray(addr, size);
            if (saveDex(bytes, 'mem')) count++;
          } catch (e) {}
        });
      } catch (e) {}
    });
    log('memScan round done (new: ' + count + ', total unique: ' + Object.keys(dumped).length + ')');
  });
}

// 壳解密 + 加载通常发生在启动后几秒内；多轮扫描覆盖懒加载
setTimeout(memScan, 6000);
setTimeout(memScan, 15000);
setTimeout(memScan, 30000);
setTimeout(memScan, 60000);
log('script loaded — waiting for dex…');
