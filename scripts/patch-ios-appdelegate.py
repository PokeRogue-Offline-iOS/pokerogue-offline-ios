#!/usr/bin/env python3
"""
patch-ios-appdelegate.py

`npx cap add ios` generates a fresh ios/App/App/AppDelegate.swift on every
build — same disposable-native-project pattern as Android's MainActivity.java
getting overwritten each run. Google Sign-In needs the app to hand incoming
URLs (the ASWebAuthenticationSession redirect back from Safari) to
GIDSignIn.sharedInstance.handle(url); without this, the sign-in flow opens
the browser but the redirect back into the app never completes the flow —
which matches the “opens/flashes then just stops” symptom this fixes.

Reference: https://capgo.app/docs/plugins/social-login/google/ios/
("Using Google Login on iOS" setup section)

Usage: python3 patch-ios-appdelegate.py <path-to-AppDelegate.swift>
"""

import sys

if len(sys.argv) != 2:
    print("Usage: patch-ios-appdelegate.py <path-to-AppDelegate.swift>", file=sys.stderr)
    sys.exit(1)

path = sys.argv[1]

with open(path) as f:
    content = f.read()

if "GIDSignIn.sharedInstance.handle(url)" in content:
    print("SKIP AppDelegate.swift — Google Sign-In URL handling already present")
    sys.exit(0)

IMPORT_ANCHOR = "import Capacitor"
if IMPORT_ANCHOR not in content:
    print("ERROR: could not find 'import Capacitor' in AppDelegate.swift.", file=sys.stderr)
    print("Capacitor's generated template may have changed — manual inspection required.", file=sys.stderr)
    sys.exit(1)
content = content.replace(IMPORT_ANCHOR, f"{IMPORT_ANCHOR}\nimport GoogleSignIn", 1)

# This exact line is Capacitor's current default body of application(_:open:options:)
# — confirmed against ionic-team/capacitor's ios-pods-template as of writing.
OLD_RETURN = "return ApplicationDelegateProxy.shared.application(app, open: url, options: options)"
NEW_RETURN = (
    "if GIDSignIn.sharedInstance.handle(url) {\n"
    "            return true\n"
    "        }\n"
    "        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)"
)

if OLD_RETURN not in content:
    print("ERROR: could not find the application(open:) return line in AppDelegate.swift.", file=sys.stderr)
    print("Capacitor's generated template may have changed — manual inspection required.", file=sys.stderr)
    sys.exit(1)
content = content.replace(OLD_RETURN, NEW_RETURN, 1)

with open(path, "w") as f:
    f.write(content)

print(f"Patched {path} for Google Sign-In URL handling.")
