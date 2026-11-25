package io.compiledtech.daybook.preview;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class DaybookActivity extends Activity {
    private static final String APP_URL = "https://appassets.androidplatform.net/daybook.html";
    private static final int FILE_PICKER = 1;
    private static final int MAX_BYTES = 16 * 1024 * 1024;
    private final Map<String, Uri> documents = new ConcurrentHashMap<>();
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private WebView web;
    private String pickerRequest;
    private String copyContents;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new FileBridge(), "DaybookAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request.isForMainFrame() && APP_URL.equals(request.getUrl().toString())) {
                    try {
                        return new WebResourceResponse("text/html", "UTF-8", getAssets().open("daybook.html"));
                    } catch (IOException ignored) {
                        return emptyResponse();
                    }
                }
                return emptyResponse();
            }
        });
        setContentView(web);
        web.loadUrl(APP_URL);
    }

    private static WebResourceResponse emptyResponse() {
        return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
    }

    private void pick(String request, boolean create, String name, String contents) {
        runOnUiThread(() -> {
            if (pickerRequest != null) {
                reply(request, "error", "Close the open file picker first.");
                return;
            }
            Intent intent = new Intent(create ? Intent.ACTION_CREATE_DOCUMENT : Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(create ? "text/csv" : "*/*");
            if (create) intent.putExtra(Intent.EXTRA_TITLE, name);
            pickerRequest = request;
            copyContents = contents;
            try {
                startActivityForResult(intent, FILE_PICKER);
            } catch (RuntimeException error) {
                pickerRequest = null;
                copyContents = null;
                reply(request, "error", "Android could not open its document picker.");
            }
        });
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code != FILE_PICKER || pickerRequest == null) return;
        String request = pickerRequest;
        String contents = copyContents;
        pickerRequest = null;
        copyContents = null;
        Uri uri = data == null ? null : data.getData();
        if (result != RESULT_OK || uri == null) {
            reply(request, "cancel", "");
            return;
        }
        io.execute(() -> {
            try {
                if (contents != null) {
                    writeCsv(uri, contents);
                    reply(request, "ok", "");
                    return;
                }
                String id = UUID.randomUUID().toString();
                JSONObject metadata = new JSONObject();
                metadata.put("id", id);
                metadata.put("name", displayName(uri));
                documents.put(id, uri);
                evaluateResult(request, "ok", metadata.toString());
            } catch (Exception error) {
                reply(request, "error", "Daybook could not access the selected file.");
            }
        });
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri,
            new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
        }
        return "Daybook.csv";
    }

    private void reply(String request, String status, String message) {
        evaluateResult(request, status, JSONObject.quote(message));
    }

    private void evaluateResult(String request, String status, String payload) {
        runOnUiThread(() -> {
            if (web == null) return;
            web.evaluateJavascript("window.daybookAndroidResult(" + JSONObject.quote(request)
                + "," + JSONObject.quote(status) + "," + payload + ")", null);
        });
    }

    private Uri uriFor(String id) throws IOException {
        Uri uri = documents.get(id);
        if (uri == null) throw new IOException("Open the CSV again to grant access.");
        return uri;
    }

    private void writeCsv(Uri uri, String contents) throws IOException {
        byte[] bytes = contents.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BYTES) throw new IOException("This preview supports CSV files up to 16 MB.");
        try (OutputStream stream = getContentResolver().openOutputStream(uri, "rwt")) {
            if (stream == null) throw new IOException("Android could not write this CSV.");
            stream.write(bytes);
        }
    }

    public final class FileBridge {
        @JavascriptInterface
        public void pick(String request, String mode, String name) {
            DaybookActivity.this.pick(request, "create".equals(mode), name, null);
        }

        @JavascriptInterface
        public void saveCopy(String request, String name, String contents) {
            DaybookActivity.this.pick(request, true, name, contents);
        }

        @JavascriptInterface
        public boolean sameDocument(String first, String second) {
            Uri uri = documents.get(first);
            return uri != null && uri.equals(documents.get(second));
        }

        @JavascriptInterface
        public void read(String request, String id) {
            io.execute(() -> {
                try (InputStream stream = getContentResolver().openInputStream(uriFor(id))) {
                    if (stream == null) throw new IOException("Android could not read this CSV.");
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = stream.read(buffer)) != -1) {
                        if (bytes.size() + count > MAX_BYTES) {
                            throw new IOException("This preview supports CSV files up to 16 MB.");
                        }
                        bytes.write(buffer, 0, count);
                    }
                    reply(request, "ok", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
                } catch (Exception error) {
                    reply(request, "error", "Could not open the CSV. Check that it is accessible and below 16 MB.");
                }
            });
        }

        @JavascriptInterface
        public void write(String request, String id, String contents) {
            io.execute(() -> {
                try {
                    writeCsv(uriFor(id), contents);
                    reply(request, "ok", "");
                } catch (Exception error) {
                    reply(request, "error", "Could not save the CSV. Try Save as and select a writable location.");
                }
            });
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("typeof ledger !== 'undefined' && !!ledger?.dirty", dirty -> {
            if ("false".equals(dirty)) {
                finish();
            } else {
                new AlertDialog.Builder(this)
                    .setMessage("Close Daybook and discard unsaved changes?")
                    .setNegativeButton("Keep editing", null)
                    .setPositiveButton("Discard and close", (dialog, button) -> finish())
                    .show();
            }
        });
    }

    @Override
    protected void onDestroy() {
        io.shutdown();
        if (web != null) {
            web.removeJavascriptInterface("DaybookAndroid");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
