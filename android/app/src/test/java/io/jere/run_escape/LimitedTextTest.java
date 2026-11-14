package io.jere.run_escape;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public final class LimitedTextTest {
    private static InputStream text(String text) {
        return new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    public void readsTextUpToItsLimit() throws IOException {
        assertEquals("abc", LimitedText.read(text("abc"), 3));
        assertEquals("café", LimitedText.read(text("café"), 5));
        assertEquals("", LimitedText.read(text(""), 0));
    }

    @Test
    public void refusesTextPastItsLimit() {
        try {
            LimitedText.read(text("abcd"), 3);
            fail("Read past the limit");
        } catch (IOException expected) {
            // Refused
        }
    }

    @Test
    public void stopsOnAnInterruptedThreadAndClosesTheStream() {
        AtomicBoolean closed = new AtomicBoolean();
        InputStream stream = new ByteArrayInputStream(new byte[]{'a'}) {
            @Override public void close() { closed.set(true); }
        };
        Thread.currentThread().interrupt();
        try {
            LimitedText.read(stream, 10);
            fail("Read on");
        } catch (InterruptedIOException expected) {
            // Stopped
        } catch (IOException other) {
            fail("Not as interrupted: " + other);
        } finally {
            // Clears it for the next test
            Thread.interrupted();
        }
        assertTrue(closed.get());
    }
}
