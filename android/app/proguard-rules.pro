# Add project specific ProGuard rules here.
# GeckoView, AndroidX and other AAR dependencies ship their own consumer rules bundled in
# their AARs, which R8 picks up automatically - nothing project-specific has needed a keep
# rule here yet. If a future reflection-based API (e.g. @JavascriptInterface) is added, its
# class needs an explicit -keep rule, since R8 can't see reflection calls by name.
