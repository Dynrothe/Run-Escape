package io.jere.run_escape;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.nio.charset.StandardCharsets;

/** Reads a stream as UTF-8 text, for the app's small downloads and files. No Android dependencies. */
final class LimitedText {
    private LimitedText() { }

    /**
     * The whole stream, closed afterwards. Refuses one longer than limit bytes, and stops when the
     * thread's interrupted (the app's closing), rather than reading on.
     */
    static String read(InputStream stream, int limit) throws IOException {
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("Interrupted");
                if (output.size() + read > limit) throw new IOException("Longer than " + limit + " bytes");
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
}
