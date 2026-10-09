package com.uta.songlearning;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;

// 文件分块读取独立于 Android 桥接，统一处理 JSON 整数的 Integer / Long 类型。
final class WebDavFileChunks {
    static byte[] read(File file, Object value) throws IOException {
        if (!(value instanceof Number)) throw new IOException("读取位置无效。");
        Number number = (Number) value;
        long offset = number.longValue();
        if (number.doubleValue() != offset || offset < 0 || offset > file.length()) {
            throw new IOException("读取位置无效。");
        }
        byte[] bytes = new byte[(int) Math.min(256 * 1024, file.length() - offset)];
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            input.seek(offset);
            input.readFully(bytes);
        }
        return bytes;
    }
}
