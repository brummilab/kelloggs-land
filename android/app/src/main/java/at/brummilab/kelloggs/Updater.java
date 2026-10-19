package at.brummilab.kelloggs;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * In-app update: on start, look at the newest releases of the GitHub repo (pre-releases included). A release
 * tagged v0.N-test with N greater than this app's versionCode is offered; on "yes" the APK is downloaded and
 * handed to the Android installer. All releases are signed with the same test key, so they install over each other.
 */
final class Updater {
    private static final String RELEASES = "https://api.github.com/repos/brummilab/kelloggs-land/releases?per_page=10";
    private static final Pattern TAG = Pattern.compile("^v0\\.(\\d+)-test$");
    private final Activity act;

    Updater(Activity act) { this.act = act; }

    void checkInBackground() {
        new Thread(() -> {
            try {
                JSONArray list = new JSONArray(new String(get(RELEASES), "UTF-8"));
                int current = currentCode(), best = current;
                String bestName = null, bestUrl = null;
                for (int i = 0; i < list.length(); i++) {
                    JSONObject r = list.getJSONObject(i);
                    if (r.optBoolean("draft")) continue;
                    Matcher m = TAG.matcher(r.optString("tag_name"));
                    if (!m.matches()) continue;
                    int code = Integer.parseInt(m.group(1));
                    if (code <= best) continue;
                    JSONArray assets = r.optJSONArray("assets");
                    if (assets == null) continue;
                    for (int j = 0; j < assets.length(); j++) {
                        JSONObject a = assets.getJSONObject(j);
                        if (a.optString("name").endsWith(".apk")) {
                            best = code; bestName = r.optString("tag_name").substring(1); bestUrl = a.optString("browser_download_url");
                        }
                    }
                }
                if (bestUrl == null) return;
                SharedPreferences prefs = act.getSharedPreferences("update", Activity.MODE_PRIVATE);
                if (prefs.getInt("skip", 0) == best) return;
                final String name = bestName, url = bestUrl; final int code = best;
                act.runOnUiThread(() -> new AlertDialog.Builder(act)
                        .setTitle("Update verfügbar")
                        .setMessage("Version " + name + " ist da (installiert: " + BuildConfig.VERSION_NAME + "). Jetzt herunterladen und installieren?")
                        .setPositiveButton("Installieren", (d, w) -> download(url, name))
                        .setNeutralButton("Später", null)
                        .setNegativeButton("Diese überspringen", (d, w) -> prefs.edit().putInt("skip", code).apply())
                        .show());
            } catch (Exception e) {
                // offline or GitHub not reachable: just play
            }
        }).start();
    }

    private int currentCode() {
        try { return act.getPackageManager().getPackageInfo(act.getPackageName(), 0).versionCode; } catch (Exception e) { return 0; }
    }

    private void download(String url, String name) {
        if (Build.VERSION.SDK_INT >= 26 && !act.getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(act, "Bitte einmal erlauben, dass diese App Updates installieren darf, dann nochmal starten.", Toast.LENGTH_LONG).show();
            act.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + act.getPackageName())));
            return;
        }
        Toast.makeText(act, "Lade Version " + name + " …", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            try {
                File dir = new File(act.getCacheDir(), "updates");
                dir.mkdirs();
                File apk = new File(dir, "KelloggsLand-" + name + ".apk");
                try (FileOutputStream out = new FileOutputStream(apk)) { out.write(get(url)); }
                Uri uri = FileProvider.getUriForFile(act, act.getPackageName() + ".updates", apk);
                Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                act.runOnUiThread(() -> act.startActivity(i));
            } catch (Exception e) {
                act.runOnUiThread(() -> Toast.makeText(act, "Update fehlgeschlagen: " + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        }).start();
    }

    private static byte[] get(String url) throws Exception {
        for (int hop = 0; hop < 5; hop++) {   // GitHub downloads redirect to another host
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(10000); c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "KelloggsLand-App");
            c.setRequestProperty("Accept", url.contains("api.github.com") ? "application/vnd.github+json" : "application/octet-stream");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) { url = c.getHeaderField("Location"); c.disconnect(); continue; }
            if (code != 200) throw new Exception("HTTP " + code);
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] b = new byte[65536]; int n;
                while ((n = in.read(b)) > 0) buf.write(b, 0, n);
                return buf.toByteArray();
            }
        }
        throw new Exception("zu viele Weiterleitungen");
    }
}
