# Google Drive OAuth setup

SilverShadow PokéRogue Offline stores one JSON backup in the user's hidden
Google Drive `appDataFolder`. The code requests only
`https://www.googleapis.com/auth/drive.appdata`, which Google currently lists
as a non-sensitive, app-specific configuration-data scope. The backup and
restore actions are manual; there is no automatic sync or project-owned data
server.

Builds deliberately keep working while credentials are absent. In that state,
the Google Drive rows remain present on supported platforms, but Connect
reports that OAuth is not configured. Nintendo Switch continues to omit the
Drive rows because that build enforces a no-network runtime policy.

## 1. Create the Google Cloud project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select the project that will own SilverShadow's OAuth clients.
3. Open **APIs & Services → Library**, find **Google Drive API**, and enable it.
4. Open **Google Auth Platform** and complete **Branding** and **Audience**.
   Use **External** unless this is restricted to one Google Workspace
   organization.
5. Under **Data Access**, add
   `https://www.googleapis.com/auth/drive.appdata` and no broader Drive scope.
6. While the app is in Testing, add each account that will test backups under
   **Audience → Test users**.

Google's console is authoritative about whether brand or OAuth verification is
required. For a public production audience, provide a public home page, this
repository's privacy policy, a support email, and any verification material the
console requests. Do not add test-only origins or redirect URIs to production
clients.

## 2. Create the shared Web client

Android Credential Manager requires a **Web application** client ID as its
token audience even though the app is native. Create one Web application OAuth
client in the same project and copy its client ID. The Android client ID is not
used as `webClientId`.

Add this repository secret:

| GitHub secret | Value |
| --- | --- |
| `GOOGLE_WEB_CLIENT_ID` | The Web application client ID ending in `.apps.googleusercontent.com` |

No Web client secret is needed by the mobile flow.

## 3. Register Android clients

Create an **Android** OAuth client for each installed package/signing
certificate combination:

| Build | Package name |
| --- | --- |
| Main | `com.silvershadow.pkr` |
| Development | `com.silvershadow.pkrdev` |

Both GitHub builds use the pinned keystore stored in
`ANDROID_DEBUG_KEYSTORE_B64`. The Android workflow prints the certificate's
public `SHA1:` fingerprint in the **Print Android OAuth signing SHA-1** step.
Run one build with the OAuth secret absent if necessary, copy that fingerprint,
create both Android clients with the matching package names, then add
`GOOGLE_WEB_CLIENT_ID` and rebuild.

For a locally signed APK, obtain the fingerprint from the actual certificate:

```text
keytool -printcert -jarfile path/to/app.apk
```

An Android OAuth client stays in Google Cloud; its client ID is not copied into
the app or GitHub secrets. If the package name or signing key differs, create a
matching additional Android client.

## 4. Optional iOS clients

Create one **iOS** OAuth client for each current bundle ID:

| Build | Bundle ID | Client-ID secret | Reversed-client-ID secret |
| --- | --- | --- | --- |
| Main | `com.silvershadow.pkr` | `GOOGLE_IOS_CLIENT_ID` | `GOOGLE_IOS_REVERSED_CLIENT_ID` |
| Development | `com.silvershadow.pkrdev` | `GOOGLE_IOS_DEV_CLIENT_ID` | `GOOGLE_IOS_DEV_REVERSED_CLIENT_ID` |

The workflow injects the iOS client ID into the Capacitor configuration and
registers the corresponding reversed client ID as the app's URL scheme. Keep
`GOOGLE_WEB_CLIENT_ID` configured as the optional server client/token audience.

The Google iOS clients, Apple App IDs, and provisioning profiles must use
these exact bundle IDs. Changing either ID requires a new matching OAuth
client and signing configuration.

## 5. Optional desktop client

Create a **Desktop app** OAuth client for Windows, Linux, and macOS. The
Electron flow opens the system browser, uses PKCE, listens on a random
`127.0.0.1` loopback port, requests offline access, and stores the refresh token
with Electron `safeStorage` when the operating system provides it.

Add these repository secrets:

| GitHub secret | Value |
| --- | --- |
| `GOOGLE_DESKTOP_CLIENT_ID` | Desktop app client ID |
| `GOOGLE_DESKTOP_CLIENT_SECRET` | Desktop app client secret from the downloaded credentials |

Desktop OAuth credentials embedded in an installed application cannot be
treated as cryptographic secrets. PKCE protects each authorization-code
exchange; the GitHub secrets mainly keep the values out of ordinary source
history.

## 6. Test the complete flow

1. Build the desired platform from this branch.
2. Open **Settings → Offline → Connect Google Account**.
3. Back up with **Include Current Run** Off and confirm **Drive Last Played**
   updates.
4. Export the local save manually as a separate safety copy.
5. Change a harmless local setting, restore the Drive backup, and press Confirm
   again when prompted to reload.
6. Repeat with **Include Current Run** On and verify an active run is restored.
7. On Android, if account selection ends with a configuration error, compare
   the installed package, signing SHA-1, and Web client ID. Google Cloud changes
   can take time to propagate.

Primary setup references:

- [Google Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google OAuth for desktop and iOS apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Capgo Google login on Android](https://capgo.app/docs/plugins/social-login/google/android/)
- [Capgo Google login on iOS](https://capgo.app/docs/plugins/social-login/google/ios/)
