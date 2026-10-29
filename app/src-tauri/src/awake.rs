//! **مزيج يبقى صاحيًا ما دام وكيلٌ مربوطًا به** (٢٩ أكتوبر ٢٠٢٦).
//!
//! حين يعمل Claude أو Codex على مزيج في الخلفية — والمستخدم في تطبيقٍ آخر — كان ماك
//! يُنيم التطبيقَ (App Nap) ويُبطئ WebKit مؤقّتاتِ الصفحة المخفيّة، فكلُّ أداةٍ تنتظر
//! مؤقّتًا قصيرًا (`flush` في `mcpTools.ts`) تتأخّر حتى تنتهي مهلتُها، ويصمت الجسرُ كلُّه.
//! رُصد حرفيًّا: التطبيقُ عند ٠٪ من المعالج والخادمُ يجيب «لم يردّ مزيج في الوقت».
//!
//! فما دام الخادمُ يعمل: (١) نشاطٌ مُعلَن لدى النظام يمنع النوم (لا يمنع إطفاءَ الشاشة)،
//! و(٢) سياسةُ WebKit للصفحة غير النشطة = «بلا إبطاء» (ماك ١٤ فما فوق). ويُرفَع الأوّل
//! حين يُطفأ الخادم.

#[cfg(target_os = "macos")]
mod imp {
    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, Bool};
    use objc2::{class, msg_send, sel};
    use objc2_foundation::NSString;
    use std::sync::Mutex;

    struct Token(Retained<AnyObject>);
    unsafe impl Send for Token {}
    static ACTIVITY: Mutex<Option<Token>> = Mutex::new(None);

    /// NSActivityUserInitiatedAllowingIdleSystemSleep: يمنع App Nap ولا يمنع نومَ الجهاز.
    const OPTIONS: u64 = 0x00FF_FFFF & !(1u64 << 20);

    pub fn begin() {
        let mut slot = ACTIVITY.lock().unwrap();
        if slot.is_some() {
            return;
        }
        unsafe {
            let info: *mut AnyObject = msg_send![class!(NSProcessInfo), processInfo];
            if info.is_null() {
                return;
            }
            let reason = NSString::from_str("Mazij is connected to an AI agent");
            let token: Option<Retained<AnyObject>> = msg_send![info, beginActivityWithOptions: OPTIONS, reason: &*reason];
            if let Some(t) = token {
                *slot = Some(Token(t));
            }
        }
    }

    pub fn end() {
        let mut slot = ACTIVITY.lock().unwrap();
        if let Some(Token(t)) = slot.take() {
            unsafe {
                let info: *mut AnyObject = msg_send![class!(NSProcessInfo), processInfo];
                if !info.is_null() {
                    let _: () = msg_send![info, endActivity: &*t];
                }
            }
        }
    }

    /// `view` هو WKWebView الخامُ الذي تعطيه Tauri.
    pub fn webview_never_throttle(view: *mut std::ffi::c_void) {
        if view.is_null() {
            return;
        }
        unsafe {
            let view = view as *mut AnyObject;
            let config: *mut AnyObject = msg_send![view, configuration];
            if config.is_null() {
                return;
            }
            let prefs: *mut AnyObject = msg_send![config, preferences];
            if prefs.is_null() {
                return;
            }
            let ok: Bool = msg_send![prefs, respondsToSelector: sel!(setInactiveSchedulingPolicy:)];
            if ok.as_bool() {
                // WKInactiveSchedulingPolicyNone = 2
                let _: () = msg_send![prefs, setInactiveSchedulingPolicy: 2isize];
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn begin() {}
    pub fn end() {}
    pub fn webview_never_throttle(_view: *mut std::ffi::c_void) {}
}

pub use imp::{begin, end};

/// تُستدعى مرّةً عند فتح النافذة.
pub fn configure_webview<R: tauri::Runtime>(win: &tauri::WebviewWindow<R>) {
    #[cfg(target_os = "macos")]
    {
        let _ = win.with_webview(|wv| imp::webview_never_throttle(wv.inner()));
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = win;
    }
}
