package com.uta.songlearning;

import org.junit.Test;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Arrays;
import static org.junit.Assert.*;

// 回归验证跨块下载：整数偏移不能回落到零，最后一块必须按实际剩余字节读取。
public class WebDavFileChunksTest {
    @Test public void integerAndLongOffsetsRestoreEveryByte() throws Exception {
        byte[] source = new byte[256 * 1024 * 2 + 17];
        Arrays.fill(source, 0, 256 * 1024, (byte) 17);
        Arrays.fill(source, 256 * 1024, 512 * 1024, (byte) 42);
        Arrays.fill(source, 512 * 1024, source.length, (byte) 99);
        File file = File.createTempFile("uta-chunks-", ".part");
        try {
            Files.write(file.toPath(), source);
            assertArrayEquals(Arrays.copyOfRange(source, 0, 256 * 1024), WebDavFileChunks.read(file, Integer.valueOf(0)));
            assertArrayEquals(Arrays.copyOfRange(source, 256 * 1024, 512 * 1024), WebDavFileChunks.read(file, Integer.valueOf(256 * 1024)));
            assertArrayEquals(Arrays.copyOfRange(source, 512 * 1024, source.length), WebDavFileChunks.read(file, Long.valueOf(512 * 1024)));
            assertEquals(0, WebDavFileChunks.read(file, Integer.valueOf(source.length)).length);
            for (Object invalid : new Object[]{null, "0", -1, 1.5, Double.NaN, Double.POSITIVE_INFINITY, source.length + 1}) {
                assertThrows(IOException.class, () -> WebDavFileChunks.read(file, invalid));
            }
        } finally { Files.deleteIfExists(file.toPath()); }
    }
}
