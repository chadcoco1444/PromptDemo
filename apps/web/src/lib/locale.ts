export type SupportedLocale = 'en' | 'zh';

// Auto-detection (detectLocale + navigator.language sniff) was deliberately
// removed in v2.1. The flash-of-English → Chinese swap on hydration created
// SSR/CSR mismatch warnings and a visible layout jump. Locale now starts
// hard-locked to 'en' on every mount; users opt into 'zh' via the toggle.
