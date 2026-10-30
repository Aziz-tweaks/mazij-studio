export type Lang = 'ar' | 'en';

export interface Dictionary {
  app: string; home: string; saved: string; saving: string; save_error: string; simple: string; pro: string;
  search: string; export: string; props: string; assets: string; ai: string; lang_btn: string;
  undo: string; redo: string; collapse: string; duration: string;
  tool_select: string; tool_text: string; tool_shape: string; tool_pen: string; tool_image: string;
  tool_lottie: string; tool_video: string; tool_audio: string; tool_fx: string;
  hint_text: string; hint_shape: string; hint_pen: string; hint_image: string; hint_lottie: string; hint_video: string;
  hint_audio: string; hint_fx: string;
  img_ph: string; fit: string; timeline: string; layers: string; easing: string; ease_out: string;
  tl_simple_hint: string; tl_play: string; tl_pause: string;
  l_bg: string; l_img: string; l_head: string; l_badge: string; l_logo: string;
  anim_none: string; anim_fade: string; anim_slide: string; anim_pop: string; anim_drop: string; anim_side: string; anim_shrink: string; anim_spin: string; anim_focus: string;
  align_h: string; align_v: string; al_start: string; al_center: string; al_end: string; al_top: string; al_middle: string; al_bottom: string;
  sec_text: string; color: string; align: string; animation: string; transform: string; blend: string;
  tracking: string;
  justify_kashida: string;
  effects: string; stroke: string; more: string;
  w_regular: string; w_medium: string; w_bold: string; blend_normal: string; blend_multiply: string; blend_screen: string; blend_overlay: string; blend_darken: string; blend_lighten: string; blend_soft_light: string; blend_difference: string; fx_shadow: string;
  fx_blur: string; add_fx: string;
  path: string; anchors: string; close_path: string; boolean: string; union: string; subtract: string;
  intersect: string; smooth: string; exclude: string; smooth_amount: string; corner_points: string;
  corner_points_hint: string; point_corner: string; point_smooth: string; boolean_open_path_hint: string;
  node_edit_start: string; node_edit_done: string; node_edit_hint: string;
  boolean_after_create_hint: string;
  tab_files: string; tab_fonts: string; tab_colors: string; tab_templates: string;
  drop: string; browse: string; add_font: string; font_url_ph: string; load: string; font_note: string;
  loading: string; ready: string; installed: string; sample: string;
  project_colors: string; brand: string;
  ai_name: string; ai_welcome: string; ai_ph: string; ai_note: string;
  ai_eng_local: string; ai_eng_custom: string; ai_note_agent: string; ai_note_custom: string; ai_missing: string; ai_custom_ph: string; ai_stop: string; ai_working: string; ai_welcome_agent: string;
  sug1: string; sug2: string; sug3: string; sug4: string;
  apply: string;
  cmd_ph: string; cmd_hint: string; no_results: string;
  ex_title: string; ex_format: string; ex_image: string; ex_video: string; ex_sizes: string;
  /** بديلُ صورةِ المعاينة في حوار التصدير — وهي الآن تصييرُ المستند نفسِه. */
  ex_preview_alt: string;
  select_all: string; quality: string; q_high: string; q_med: string; scale: string; transparent: string;
  exporting: string; ex_done: string; open_folder: string; cancel: string;
  ex_unavailable: string; ex_error: string; font_error: string; reveal_folder: string; ex_results: string;
  exportN: (n: number) => string;
  ex_fps: string; ex_mp4_no_alpha: string;
  ex_shutter: string; ex_shutter_off: string; ex_shutter_cost: string; ex_shutter_preview: string;
  h_greet: string; h_prompt_ph: string; start: string; new_project: string; custom_size: string;
  templates: string; recent: string;
  t1: string; t2: string; t3: string; t4: string; t5: string; t6: string;
  // العشرة المضافة في ٢٢ أكتوبر ٢٠٢٦ — انظر `STARTER_TEMPLATES` في `src/lib/starterTemplates.ts`.
  t7: string; t8: string; t9: string; t10: string; t11: string; t12: string; t13: string; t14: string; t15: string; t16: string;
  rec1: string; rec2: string; rec3: string; time1: string; time2: string; time3: string;
  // شاشة البداية — ١٨ أكتوبر ٢٠٢٦
  h_search_ph: string; h_suggested: string; h_blank: string; h_blank_hint: string;
  h_medium_all: string; h_medium_still: string; h_medium_timed: string;
  h_still: string; h_timed: string;
  h_no_results: (q: string) => string;
  h_resume: string; h_resume_blank: string; h_resume_cta: string; h_projects: string; h_project_age: (ms: number) => string;
  h_elements: (n: number) => string; h_artboards: (n: number) => string;
  h_projects_soon: string; h_custom_start: string;
  sel_head: string; sel_badge: string;
  l_discount: string; l_generic_text: string; l_generic_shape: string; l_generic_image: string; l_generic_lottie: string; l_generic_video: string;
  hide_layer: string; show_layer: string; shape_rect: string; shape_ellipse: string;
  /** أسماء الطبقات المقروءة — انظر `src/lib/layerNames.ts` والبند ٨ في
   * `docs/UX-AUDIT-2026-10-18.md`. */
  ln_text: string; ln_rect: string; ln_ellipse: string; ln_path: string; ln_outline: string;
  ln_image: string; ln_image_ph: string; ln_lottie: string; ln_video: string;
  ln_element: string; ln_group: string;
  /** تنظيم العناصر: تجميع وقفل وإخفاء وإعادة تسمية. */
  organise: string; lock_layer: string; unlock_layer: string; unlock_all: string; show_all: string;
  group_selected: string; ungroup_selected: string;
  rename_layer: string; rename_hint: string; locked_badge: string;
  /** لوح مكتبة الأداة (تبويب «العناصر»، باسم تبويب الأداة الشائعة نفسه) وبطاقات الأشكال فيه. */
  library: string; lib_soon_body: string; lib_soon_tool_active: string; shp_how: string;
  shp_sec_basic: string; shp_sec_polygons: string; shp_sec_stars: string; shp_sec_lines: string; shp_sec_flowchart: string;
  shape_roundRect: string; shape_triangle: string; shape_pentagon: string; shape_hexagon: string; shape_octagon: string;
  shape_star5: string; shape_star6: string; shape_star8: string; shape_line: string; shape_arrow: string;
  shape_diamond: string; shape_bubble: string;
  sec_shape: string; sec_image: string; radius: string; on_state: string; off_state: string;
  replace_image: string; choose_image: string; fit_cover: string; fit_contain: string;
  arrange: string; bring_forward: string; send_backward: string; align_elements: string;
  distribute_h: string; distribute_v: string; no_selection: string; pen_hint: string;
  ex_codec: string; ex_audio: string; ex_tip_mp4: string; ex_tip_mov: string; ex_tip_webm: string; ex_tip_gif: string; ex_alpha_note: string;
  fit_fill: string; crop_frame: string; crop_start: string; crop_done: string; crop_hint: string;
  crop_reset: string; zoom: string; flip_h: string; flip_v: string; lock_aspect: string;
  pivot_label: string; pivot_hint: string; pivot_reset: string; line_height: string;
  tl_zoom_in: string; tl_zoom_out: string; tl_zoom_fit: string;
  sec_mask: string; mask_hint: string; clip_mask: string; release_mask: string;
  sec_appearance: string; appearance_fills: string; appearance_strokes: string; appearance_shadows: string;
  appearance_add: string; appearance_empty: string; stroke_pos_inside: string; stroke_pos_center: string; stroke_pos_outside: string;
  shadow_kind_outer: string; shadow_kind_inner: string; appearance_gradient: string; appearance_radial: string; appearance_solid: string;
  stroke_taper: string; stroke_taper_none: string; stroke_taper_end: string; stroke_taper_start: string;
  stroke_taper_lens: string; stroke_taper_pinch: string; stroke_taper_custom: string;
  post_palettes: string; palette_emerald: string;
  decor_title: string; decor_accent: string; decor_hint: string;
  apply_palette_all: string; apply_palette_hint: string;
  'l_badge-label': string; 'l_logo-label': string;
  ease_linear: string; ease_expo: string; ease_in: string; ease_in_out: string; ease_back: string; ease_bounce: string; ease_hold: string; ease_custom: string;
  no_easing_target: string; add_keyframe: string; delete_keyframe: string; kf_value: string; soon: string;
  /** اسمُ خطوةِ التراجع لتغييرِ قيمةِ مفتاح — انظر `pushHistory`: كلُّ ما يُغيّر
   * المستند خطوةٌ واحدةٌ **مُسمّاة**. */
  kf_set_value: string;
  /** تلميحُ الحقل الرقميّ في منبثقة المفتاح: ما يَفعله ولِمَ هو إلى جانب
   * المِمسحة لا بدلًا منها. */
  kf_value_field_hint: string;
  prop_opacity: string; prop_x: string; prop_y: string; prop_scale: string; prop_scaleX: string; prop_scaleY: string; prop_rotation: string; prop_blur: string;
  expand_tracks: string; collapse_tracks: string; kf_easing: string;
  entrance: string; tl_beyond_doc: string; sec_short: string;
  exit_anim: string; exit_none: string; exit_fade: string; exit_focus: string; exit_shrink: string; exit_grow: string; exit_up: string;
  /** المرحلة ٢ — المقاطعُ الحيّة: التقسيمُ وأسبابُ تعطيله، وحرسُ النمط الجاهز،
   * وأسماءُ خطوات التراجع. */
  split_clip: string; split_consequence: string; split_no_selection: string; split_locked: string; split_outside: string;
  preset_blocked: string;
  undo_clip_move: string; undo_clip_trim_in: string; undo_clip_trim_out: string; undo_kf_move: string;
  ex_estimate: (seconds: number, files: number, mb: number) => string;
  ex_only_project_size: string; ex_only_project_size_hint: string; ex_video_scale_locked: string;
  text_stagger: string; stagger_unit_char: string; stagger_unit_word: string; stagger_unit_line: string;
  stagger_dir_start: string; stagger_dir_end: string; stagger_dir_center: string; stagger_dir_random: string;
  stagger_fx_fade: string; stagger_fx_slide: string; stagger_fx_scale: string; stagger_fx_rotate: string;
  stagger_delay: string; stagger_unit_duration: string; stagger_line_hint: string;
  templates_btn: string; tpl_dialog_title: string; tpl_mark_slots: string; tpl_slot_none: string;
  tpl_ready: string; tpl_ready_hint: string; tpl_yours: string;
  tpl_slot_text: string; tpl_slot_image: string; tpl_slot_color: string; tpl_name_ph: string;
  tpl_save: string; tpl_library: string; tpl_empty: string; tpl_apply_motion: string;
  tpl_fill_apply: string; tpl_delete: string; tpl_fill_title: string; tpl_apply_btn: string;
  tpl_slots_label: string; tpl_cancel: string;
  magic_resize: string; magic_resize_hint: string; ex_magic_resize: string;
  local_models_btn: string; local_models_title: string; local_models_capability_bg: string;
  local_models_capability_stt: string; local_models_capability_sr: string;
  local_models_license: string; local_models_download: string; local_models_delete: string;
  local_models_downloaded: string; local_models_not_downloaded: string; local_models_non_commercial: string;
  bg_remove_btn: string; bg_restore_btn: string; bg_downloading: string; bg_processing: string; bg_local_badge: string;
  upscale_btn: string; upscale_downloading: string; upscale_processing: string; upscale_local_badge: string;
  trace_btn: string; trace_busy: string; trace_hint: string; trace_no_image: string; trace_err_decode: string;
  trace_err_empty: string; trace_err_failed: string; trace_bg_name: string; ctx_trace: string;
  nl_cmd_btn: string; nl_cmd_title: string; nl_cmd_hint: string; nl_cmd_ph: string; nl_cmd_run: string;
  nl_cmd_examples: string; nl_cmd_not_understood: string; nl_cmd_local_badge: string; nl_cmd_llm_limit: string;
  refvideo_btn: string; refvideo_title: string; refvideo_hint: string; refvideo_drop: string; refvideo_pick_btn: string;
  refvideo_analyzing: string; refvideo_error_tauri_only: string; refvideo_error_generic: string;
  refvideo_shots_found: string; refvideo_no_cuts: string; refvideo_beats_soon: string; refvideo_total_duration: string;
  refvideo_name_ph: string; refvideo_create_btn: string; refvideo_cancel: string; refvideo_shot_label: string;
  sec_lottie: string; choose_lottie: string; replace_lottie: string; lottie_loop: string; lottie_invalid: string;
  lottie_svg_note: string;
  sec_video: string; replace_video: string; video_trim_in: string; video_trim_out: string; video_volume: string;
  video_muted: string; video_loop: string; video_audio_soon: string; video_invalid: string;
  captions_btn: string; captions_downloading: string; captions_extracting: string; captions_transcribing: string;
  captions_none_found: string; captions_added: string; captions_local_badge: string; captions_en_only: string;
  ex_livephoto: string; ex_livephoto_hint: string; ex_livephoto_no_alpha: string; ex_livephoto_unavailable: string;
  ex_lp_add: string; ex_lp_adding: string; ex_lp_added: string; ex_lp_add_hint: string;
  mcp_btn: string; mcp_title: string; mcp_enable: string; mcp_hint: string; mcp_threat: string;
  mcp_status_on: string; mcp_status_off: string; mcp_port_label: string; mcp_badge: string;
  // Roadmap #20 security fix (reproduced CSRF, see src-tauri/src/mcp.rs): the
  // dialog must state what is and is not listening, and show the bearer token the
  // user has to paste into their MCP client.
  mcp_listening: string; mcp_not_listening: string; mcp_token_label: string; mcp_token_hint: string;
  mcp_copy: string; mcp_copied: string; mcp_error_label: string; mcp_token_waiting: string;
  ai_gen_btn: string; more_tools: string; pro_mode: string; pro_mode_hint: string;
  text_outline_title: string; text_outline_btn: string; text_outline_converting: string;
  text_outline_hint: string; text_outline_unsupported_font: string; text_outline_error: string;
  text_on_path_btn: string; sec_text_on_path: string; text_on_path_hint: string; text_on_path_release: string;
  artboards_btn: string; artboards_title: string; artboards_add: string; artboards_empty: string;
  artboards_name_ph: string; artboards_switch: string; artboards_rename: string; artboards_duplicate: string;
  artboards_delete: string; artboards_delete_last_hint: string; artboards_active_badge: string;
  ex_all_artboards: string; ex_all_artboards_hint: string;
  ex_own_size: string; ex_own_size_hint: string; ex_own_size_note: (n: number) => string;
  /** الواجهة الجديدة — ٢٤ أكتوبر ٢٠٢٦: شريط الإضافة، المفتش، حبّة الأدوات، الاختصارات. */
  tool_direct: string; tool_hand: string; hint_direct: string; hint_hand: string;
  rail_templates: string; rail_text: string; rail_elements: string; rail_images: string; rail_stickers: string;
  rail_video: string; rail_audio: string; rail_uploads: string; rail_brand: string; rail_fx: string; rail_label: string;
  insp_design: string; insp_open: string; insp_close: string; layers_toggle: string; m_edit_text: string; m_duplicate: string; m_delete: string; m_done: string;
  txt_heading: string; txt_subheading: string; txt_body: string; txt_styles: string; txt_hint: string;
  zoom_in: string; zoom_out: string; zoom_fit: string; tools_label: string;
  sc_title: string; sc_hint: string; sc_general: string; sc_design: string; sc_motion: string; sc_open: string;
  sc_select: string; sc_direct: string; sc_pen: string; sc_text: string; sc_rect: string; sc_ellipse: string; sc_hand: string; sc_image: string;
  sc_pan: string; sc_undo: string; sc_redo: string; sc_dup: string; sc_copy: string; sc_paste: string; sc_cut: string; sc_all: string;
  sc_delete: string; sc_nudge: string; sc_group: string; sc_ungroup: string; sc_front: string; sc_forward: string; sc_lock: string; sc_hide: string;
  sc_zoom: string; sc_fit: string; sc_actual: string; sc_search: string; sc_export: string; sc_mizo: string; sc_esc: string;
  sc_play: string; sc_split: string; sc_frame: string; sc_panels: string; sc_edit_text: string;
  ctx_font: string; ctx_size: string; ctx_bigger: string; ctx_smaller: string; ctx_color: string; ctx_bold: string; ctx_align: string;
  ctx_animate: string; ctx_more: string; ctx_fill: string; ctx_crop: string; ctx_replace: string; ctx_edit_points: string;
  ctx_group: string; ctx_duplicate: string; ctx_delete: string; ctx_align_sel: string; ctx_opacity: string; ctx_position: string; ctx_align_page: string; align_left: string; align_center: string; align_right: string; align_top: string; align_middle: string; align_bottom: string;
  pages: string; pages_add: string; pages_same_design: string; pages_to_reel: string;
  up_drop: string; stk_builtin: string; stk_upload: string; up_note_images: string; up_note_videos: string; up_in_project: string; up_reuse: string; up_pick: string; up_note: string; brand_pick_hint: string;
  sec_timing: string; timing_start: string; timing_end: string; timing_mixed: string; timing_from_playhead: string; timing_start_here: string; timing_end_here: string; clip_bounded: string; clip_bounded_hint: string; undo_clip_timing: string; undo_clip_bounded: string; clip_bounded_tip: string; clip_unbounded_tip: string;
  prop_trimStart: string; prop_trimEnd: string;
  prop_reveal: string; stagger_fx_blur: string; stagger_fx_gather: string; stagger_fx_none: string; stagger_fx_type: string; stagger_type_hint: string; reveal_timing: string; reveal_auto_hint: string; reveal_next_char: string; reveal_next_word: string; reveal_next_line: string; reveal_next_tip: string; reveal_clear: string; reveal_all_timed: string; undo_reveal_next: string; undo_reveal_clear: string;
  reveal_count: (shown: number, total: number) => string;
  sm_copy_anim: string; sm_paste_anim: string; undo_paste_anim: string;
  undo_audio_add: string; undo_audio_volume: string; undo_audio_mute: string; audio_add: string; audio_add_hint: string; audio_drop_hint: string; audio_in_doc: string; audio_none: string; sec_audio: string; audio_length: string; audio_file_length: string; audio_volume: string; audio_muted: string; audio_layer: string;
  undo_fx_add: string; undo_fx_edit: string; fx_cat_filter: string; fx_cat_effect: string; fx_cat_transition: string; fx_cat_particles: string; fx_particle_burst: string; fx_lib_hint: string; sec_fx: string; fx_amount: string; fx_fade_in: string; fx_fade_out: string; fx_kind: string; fx_layer: string; fx_peak_hint: string; fx_scope_hint: string;
  undo_font: string; font_from_file: string; font_from_file_hint: string; font_system: string; font_system_ph: string; font_use: string; font_remove: string; font_system_badge: string;
  font_not_installed: (name: string) => string;
}

export const AR: Dictionary = {
  app: 'مزيج', home: 'الرئيسية', saved: 'محفوظ', saving: 'يحفظ…', save_error: 'فشل الحفظ',
  simple: 'بسيط', pro: 'احترافي',
  search: 'ابحث أو نفّذ أمر', export: 'تصدير', props: 'التصميم', assets: 'المكتبة', ai: 'مِزو',
  lang_btn: 'EN', undo: 'تراجع', redo: 'إعادة', collapse: 'سكّر', duration: '5s · 30fps',
  tool_select: 'تحديد', tool_text: 'نص', tool_shape: 'أشكال', tool_pen: 'قلم', tool_image: 'صورة',
  tool_lottie: 'ملصق', tool_video: 'فيديو', tool_audio: 'صوت', tool_fx: 'تأثيرات',
  hint_text: 'انقر في أي مكان واكتب', hint_shape: 'اسحب وارسم · Shift للتناسب · Option من المركز',
  hint_pen: 'انقر نقطة · اسحب منحنى · Enter تخلّص', hint_image: 'انقر مكان الصورة، أو اسحبها هنا',
  hint_lottie: 'انقر مكان الملصق، أو اسحب ملف لوتي هنا',
  hint_video: 'انقر مكان الفيديو، أو اسحبه هنا', hint_audio: 'أضف موسيقى أو تعليقًا صوتيًّا يبدأ عند المؤشّر',
  hint_fx: 'فلاتر ومؤثّرات وانتقالات',
  img_ph: 'صورة المنتج', fit: 'ملاءمة', timeline: 'الحركة', layers: 'الطبقات', easing: 'المنحنى',
  ease_out: 'تباطؤ في النهاية', tl_simple_hint: 'حدّد عنصر واختر حركته',
  tl_play: 'تشغيل', tl_pause: 'إيقاف مؤقّت',
  more_tools: 'أدوات متقدّمة',
  pro_mode: 'الوضع الاحترافي',
  pro_mode_hint: 'مسك أداة المتّجهات: كل المقابض، والزاوية ما تكبّر الخط',
  l_bg: 'الخلفية', l_img: 'الصورة', l_head: 'العنوان', l_badge: 'الشارة', l_logo: 'الشعار',
  anim_none: 'بدون', anim_fade: 'ظهور تدريجي', anim_slide: 'انزلاق لأعلى', anim_pop: 'تكبير', anim_drop: 'هبوط', anim_side: 'دخول جانبي', anim_shrink: 'تصغير', anim_spin: 'دوران', anim_focus: 'تركيز',
  align_h: 'أفقيًا', align_v: 'عموديًا', al_start: 'بداية السطر (يمين)', al_center: 'وسط', al_end: 'نهاية السطر (يسار)', al_top: 'أعلى', al_middle: 'منتصف', al_bottom: 'أسفل',
  sec_text: 'النص', color: 'اللون', align: 'المحاذاة', animation: 'الحركة', transform: 'التحويل',
  tracking: 'تتبُّع الأحرف',
  justify_kashida: 'تبرير بالكشيدة',
  blend: 'المزج', effects: 'التأثيرات', stroke: 'الحدود', more: 'خيارات متقدمة',
  w_regular: 'عادي', w_medium: 'متوسط', w_bold: 'عريض', blend_normal: 'عادي', blend_multiply: 'مضاعفة', blend_screen: 'شاشة', blend_overlay: 'تراكب', blend_darken: 'تغميق', blend_lighten: 'تفتيح', blend_soft_light: 'ضوء ناعم', blend_difference: 'فرق', fx_shadow: 'ظل',
  fx_blur: 'ضبابية', add_fx: 'إضافة تأثير',
  path: 'المسار', anchors: 'نقاط الربط', close_path: 'إغلاق المسار', boolean: 'عمليات الأشكال البوليانية',
  union: 'دمج', subtract: 'طرح', intersect: 'تقاطع', smooth: 'تنعيم', exclude: 'استثناء',
  smooth_amount: 'مقدار التنعيم', corner_points: 'زوايا النقاط',
  corner_points_hint: 'بدّل كل نقطة بين ناعمة وحادة.',
  point_corner: 'حادة — انقر تنعّمها', point_smooth: 'ناعمة — انقر تحدّها',
  node_edit_start: 'تحرير نقاط المسار', node_edit_done: 'إنهاء تحرير النقاط',
  node_edit_hint: 'اسحب النقطة أو مقبضها (Alt يكسر التناظر). نقرتين على المقطع تضيف نقطة، وDelete يحذف، وEsc تخلّص.',
  boolean_open_path_hint: 'المسار المفتوح ما يدخل الدمج — سكّره أول.',
  boolean_after_create_hint: 'حدّد عنصرين أو أكثر وتطلع لك أدوات الدمج والطرح.',
  tab_files: 'الملفات', tab_fonts: 'الخطوط', tab_colors: 'الألوان', tab_templates: 'المقاسات',
  drop: 'اسحب الملفات هنا أو', browse: 'تصفح', add_font: 'أضف خط من رابط',
  font_url_ph: 'https://example.com/MyFont.ttf', load: 'تحميل',
  font_note: 'تأكد إن رخصة الخط تسمح لك.',
  loading: 'جاري التحميل…', ready: 'جاهز', installed: 'خطوطك', sample: 'أبجد هوز حطي',
  project_colors: 'ألوان التصميم', brand: 'ألوان علامتك',
  ai_name: 'مِزو',
  ai_welcome: 'هلا! أنا مِزو. اكتب أمر قصير وأنفّذه على تصميمك فورًا — بدون نت. اكتب «مساعدة» وتشوف كل الأوامر.',
  ai_ph: 'اكتب أمرك…',
  ai_note: 'محلّي: أوامر قصيرة، فوري وبدون نت.',
  ai_eng_local: 'محلّي', ai_eng_custom: 'وكيل آخر',
  ai_note_agent: 'يشتغل بحسابك على جهازك ويعدّل التصميم قدامك.',
  ai_note_custom: 'أي وكيل يقبل أمرًا نصيًا. يجد رابط الأدوات في MAZIJ_MCP_URL ورمزها في MAZIJ_MCP_TOKEN.',
  ai_missing: 'مو مثبّت على جهازك',
  ai_custom_ph: 'مثال: gemini -p {prompt} --yolo',
  ai_stop: 'إيقاف', ai_working: 'أشتغل على تصميمك…',
  ai_welcome_agent: 'هلا! أنا مِزو. قل وش تبي: «خلّ الخلفية زرقاء وكبّر العنوان»، «رتّب العناصر»، «غيّر النص لعرض رمضان». أعدّل قدامك، وتقدر تتراجع عن أي خطوة.',
  sug1: 'كبّر العنوان', sug2: 'غيّر لون الشارة للأحمر', sug3: 'خلّ الشعار نصف شفاف',
  sug4: 'مساعدة',
  apply: 'تطبيق',
  cmd_ph: 'اكتب أمراً أو اسم أداة…', cmd_hint: '↑↓ تنقّل · Enter نفّذ · Esc سكّر',
  no_results: 'ما فيه نتائج',
  ex_title: 'تصدير', ex_format: 'الصيغة', ex_image: 'صورة', ex_video: 'فيديو', ex_sizes: 'المقاسات',
  ex_preview_alt: 'معاينة التصميم الحالي',
  select_all: 'تحديد الكل', quality: 'الجودة', q_high: 'عالية', q_med: 'متوسطة', scale: 'الدقة',
  transparent: 'خلفية شفافة', exporting: 'جاري التصدير…', ex_done: 'تم التصدير',
  open_folder: 'فتح المجلد', cancel: 'إلغاء',
  ex_unavailable: 'تصدير الفيديو للحين في تطبيق الماك بس — قريبًا في الجوال والمتصفح', ex_error: 'فشل التصدير', ex_results: 'النتائج',
  font_error: 'فشل التحميل', reveal_folder: '~/Mazij/Exports',
  exportN: (n) => (n === 0 ? 'اختر مقاساً' : n === 1 ? 'تصدير ملف واحد' : n === 2 ? 'تصدير ملفين' : `تصدير ${n} ملفات`),
  ex_fps: 'معدّل الإطارات', ex_mp4_no_alpha: 'MP4 لا يدعم خلفية شفافة — استخدم GIF',
  ex_shutter: 'ضباب الحركة', ex_shutter_off: 'بلا', ex_shutter_cost: 'التصدير يطوّل مع العدد',
  ex_shutter_preview: 'الضباب يبان في الملف، مو في المعاينة',
  h_greet: 'وش نصمم اليوم؟', h_prompt_ph: 'اوصف البوست وخلّ مِزو يبدأ لك…', start: 'ابدأ',
  new_project: 'مشروع جديد', custom_size: 'مقاس مخصص', templates: 'قوالب جاهزة', recent: 'الأخيرة',
  t1: 'عرض', t2: 'عقار', t3: 'إعلان رسمي', t4: 'خطوات', t5: 'قبل/بعد', t6: 'إعلان تطبيق',
  t7: 'عرض موسمي', t8: 'اقتباس مركزي', t9: 'وظيفة شاغرة', t10: 'تذكرة فعالية', t11: 'تهنئة', t12: 'بطاقة منتج', t13: 'إنفوجرافيك', t14: 'قائمة طعام', t15: 'شهادة تقدير', t16: 'إعلان فعاليّة',
  rec1: 'بوست العروض', rec2: 'إعلان وظيفة', rec3: 'اقتباس الأسبوع',
  time1: 'قبل ساعتين', time2: 'أمس', time3: 'قبل 3 أيام',
  h_search_ph: 'وش تبغى تصمّم؟', h_suggested: 'مقترح',
  h_blank: 'ابدأ من فراغ', h_blank_hint: 'لوحة فاضية بالمقاس اللي تختاره — من غير أي محتوى جاهز',
  h_medium_all: 'الكل', h_medium_still: 'صورة', h_medium_timed: 'فيديو',
  h_still: 'صورة', h_timed: 'فيديو',
  h_no_results: (q) => `ما فيه نتائج لـ«${q}»`,
  h_resume: 'مشروعك المفتوح', h_resume_blank: 'لوحة فاضية', h_resume_cta: 'كمّل', h_projects: 'مشاريعك',
  h_project_age: (ms) => { const m = Math.floor(ms / 60000); if (m < 1) return 'الحين'; if (m < 60) return `قبل ${m} د`; const h = Math.floor(m / 60); if (h < 24) return `قبل ${h} س`; const d = Math.floor(h / 24); return d === 1 ? 'أمس' : `قبل ${d} يوم`; },
  h_elements: (n) => (n === 0 ? 'بدون عناصر' : n === 1 ? 'عنصر واحد' : n === 2 ? 'عنصران' : `${n} عناصر`),
  h_artboards: (n) => (n === 1 ? 'لوحة واحدة' : n === 2 ? 'لوحتان' : `${n} لوحات`),
  h_projects_soon: 'مشاريع متعددة ومكتبة أعمال',
  // تسمية صريحة بدل تكرار «ابدأ» مرّتين على شاشة واحدة: الزرّان يفعلان شيئين
  // مختلفين (أحدهما يسلّم الوصف لمِزو، والآخر يفتح مقاسًا مكتوبًا باليد).
  h_custom_start: 'ابدأ بهذا المقاس',
  sel_head: 'نص · العنوان', sel_badge: 'شكل · الشارة',
  l_discount: 'نص الخصم', l_generic_text: 'نص', l_generic_shape: 'شكل', l_generic_image: 'صورة', l_generic_lottie: 'ملصق متحرك', l_generic_video: 'فيديو',
  hide_layer: 'إخفاء', show_layer: 'إظهار', shape_rect: 'مستطيل', shape_ellipse: 'دائرة',
  ln_text: 'نص', ln_rect: 'مستطيل', ln_ellipse: 'دائرة', ln_path: 'مسار', ln_outline: 'مخطَّط نص',
  ln_image: 'صورة', ln_image_ph: 'مكان صورة', ln_lottie: 'ملصق متحرك', ln_video: 'فيديو',
  ln_element: 'عنصر', ln_group: 'مجموعة',
  organise: 'تنظيم', lock_layer: 'قفل', unlock_layer: 'فكّ القفل', unlock_all: 'فكّ قفل الكل', show_all: 'إظهار الكل',
  group_selected: 'تجميع', ungroup_selected: 'فكّ التجميع',
  rename_layer: 'إعادة تسمية', rename_hint: 'Enter للحفظ · Esc للإلغاء', locked_badge: 'مقفل',
  library: 'العناصر',
  lib_soon_body: 'قاعدين نبنيها.',
  lib_soon_tool_active: 'الأداة نفسها شغّالة على اللوحة.',
  shp_how: 'انقر شكل وينزل في الوسط، أو اسحب على اللوحة وارسمه بالمقاس اللي تبيه.',
  shp_sec_basic: 'الأشكال الأساسية', shp_sec_polygons: 'مضلعات', shp_sec_stars: 'النجوم',
  shp_sec_lines: 'خطوط وأسهم', shp_sec_flowchart: 'خريطة تدفّق وفقاعات',
  shape_roundRect: 'مستطيل بزوايا', shape_triangle: 'مثلّث', shape_pentagon: 'مخمّس', shape_hexagon: 'مسدّس', shape_octagon: 'مثمّن',
  shape_star5: 'نجمة خماسيّة', shape_star6: 'نجمة سداسيّة', shape_star8: 'نجمة ثمانيّة', shape_line: 'خطّ', shape_arrow: 'سهم',
  shape_diamond: 'معيَّن', shape_bubble: 'فقاعة كلام',
  sec_shape: 'الشكل', sec_image: 'الصورة', radius: 'الزوايا', on_state: 'فعّل', off_state: 'بدون',
  replace_image: 'استبدال الصورة', choose_image: 'اختر صورة', fit_cover: 'تعبئة', fit_contain: 'احتواء',
  arrange: 'الترتيب', bring_forward: 'للأمام', send_backward: 'للخلف', align_elements: 'محاذاة العناصر',
  distribute_h: 'توزيع أفقي', distribute_v: 'توزيع عمودي', no_selection: 'حدّد عنصر وتطلع خصائصه هنا', ex_codec: 'الترميز', ex_audio: 'الصوت', ex_tip_mp4: 'MP4 — يعمل في كل مكان (سوشال، جوال، ويب)', ex_tip_mov: 'MOV ProRes — جودة مونتاج، ويحفظ الخلفية الشفافة (تفريغ)', ex_tip_webm: 'WebM VP9 — للويب، ويحفظ الخلفية الشفافة', ex_tip_gif: 'GIF — صورة متحركة بلا صوت', ex_alpha_note: 'الخلفية شفافة: الملف يُركَّب فوق فيديو آخر في أي برنامج مونتاج.',
  pen_hint: 'انقر نقاط المسار، ونقرتين أو Enter تخلّص. Esc يلغي.',
  fit_fill: 'تمديد', crop_frame: 'القص داخل الإطار', crop_start: 'تحريك الصورة', crop_done: 'تم',
  crop_hint: 'اسحب الصورة داخل الإطار، وكبّرها من الشريط.',
  crop_reset: 'إعادة ضبط الموضع والتكبير', zoom: 'تكبير', flip_h: 'عكس أفقي', flip_v: 'عكس عمودي',
  lock_aspect: 'قفل النسبة',
  pivot_label: 'نقطة الارتكاز',
  pivot_hint: 'يدور حولها التحريك ويكبر منها — الزاوية الثابتة تبقى حول المركز',
  pivot_reset: 'رجّعها للمركز',
  line_height: 'تباعد الأسطر',
  tl_zoom_in: 'كبّر الخط الزمني (⌘ + العجلة)',
  tl_zoom_out: 'صغّر الخط الزمني',
  tl_zoom_fit: 'الكل',
  sec_mask: 'قص بالشكل', mask_hint: 'واحد من المحددين شكل: خلّه قالب قص للثاني.',
  clip_mask: 'قص بالشكل', release_mask: 'فك القص', post_palettes: 'لوحات ألوان', palette_emerald: 'زمرّدي وذهبي',
  decor_title: 'زخرفة اللوحة', decor_accent: 'دائرة لونيّة في الزاوية',
  decor_hint: 'دائرة بلون اللوحة ورا العناصر.',
  sec_appearance: 'المظهر', appearance_fills: 'التعبئة', appearance_strokes: 'الحدود', appearance_shadows: 'الظل',
  appearance_add: '+ إضافة طبقة', appearance_empty: 'لا طبقات', stroke_pos_inside: 'داخل', stroke_pos_center: 'وسط', stroke_pos_outside: 'خارج',
  shadow_kind_outer: 'خارجي', shadow_kind_inner: 'داخلي', appearance_gradient: 'تدرّج', appearance_radial: 'تدرّج دائري', appearance_solid: 'لون واحد',
  stroke_taper: 'تدرّج السُّمك', stroke_taper_none: 'منتظم', stroke_taper_end: 'يرقّ في النهاية', stroke_taper_start: 'يرقّ في البداية',
  stroke_taper_lens: 'رفيعٌ في الطرفين', stroke_taper_pinch: 'رفيعٌ في الوسط', stroke_taper_custom: 'مخصّص',
  apply_palette_all: 'تطبيق اللوحة على كل عنصر',
  apply_palette_hint: 'يلوّن كل النصوص والأشكال باللوحة الحالية — حتى اللي لوّنتها بيدك. وتقدر تتراجع.',
  'l_badge-label': 'نص الشارة', 'l_logo-label': 'نص الشعار',
  ease_linear: 'خطي', ease_expo: 'انسيابي', ease_in: 'تسريع في البداية', ease_in_out: 'تسريع وتباطؤ', ease_back: 'قفزة للخلف',
  ease_bounce: 'ارتداد', ease_hold: 'تثبيت', ease_custom: 'مخصص',
  no_easing_target: 'حدّد عنصر وغيّر منحناه', add_keyframe: 'إضافة مفتاح عند المؤشر',
  delete_keyframe: 'حذف المفتاح', kf_value: 'القيمة', soon: 'قريبًا',
  kf_set_value: 'قيمة المفتاح',
  kf_value_field_hint: 'اكتب القيمة بالضبط، أو اسحب للتقريب.',
  tl_beyond_doc: 'بعد نهاية الفيديو — ما يدخل التصدير. اسحب طرف مقطع لهنا عشان يطول.',
  split_clip: 'تقسيم', split_consequence: 'يُنتج عنصرين منفصلين بالنصّ نفسه',
  split_no_selection: 'حدّد مقطع', split_locked: 'الطبقة مقفولة — افتحها أول',
  split_outside: 'حط المؤشر داخل المقطع',
  preset_blocked: 'الحركة الجاهزة بتمسح مفاتيحك اللي ضبطتها بيدك — احذفها أول إذا تبي تبدأ من جديد.',
  undo_clip_move: 'نقل المقطع', undo_clip_trim_in: 'تقليم بداية المقطع', undo_clip_trim_out: 'تقليم نهاية المقطع',
  undo_kf_move: 'نقل مفتاح',
  prop_opacity: 'الشفافية', prop_x: 'الموضع X', prop_y: 'الموضع Y', prop_scale: 'المقياس', prop_scaleX: 'العرض', prop_scaleY: 'الارتفاع', prop_rotation: 'الدوران', prop_blur: 'الضبابية',
  expand_tracks: 'إظهار مسارات الخصائص', collapse_tracks: 'إخفاء مسارات الخصائص', kf_easing: 'منحنى المفتاح',
  entrance: 'حركة الدخول',
  exit_anim: 'حركة الخروج', exit_none: 'بلا خروج', exit_fade: 'تلاشٍ', exit_focus: 'ضبابيّة', exit_shrink: 'تصغير', exit_grow: 'تكبير', exit_up: 'صعود',
  sec_short: 'ث',
  // يُقال للمصمّم **لماذا** تعطَّل المفتاح، لا أنه معطَّل: المفتاح يُضاف عند المؤشّر،
  // والمؤشّر واقع خارج مقطع هذه الطبقة، فلا موضع له أصلًا.
  ex_estimate: (seconds, files, mb) =>
    `المدّة ${seconds} ث · ${files === 1 ? 'ملف واحد' : files === 2 ? 'ملفان' : `${files} ملفات`} · الحجم ≈ ${mb} م.ب`,
  ex_only_project_size: 'مقاس المشروع فقط', ex_only_project_size_hint: 'مقاس هذي اللوحة بس',
  ex_video_scale_locked: 'الفيديو يطلع بدقة اللوحة — المضاعف للصور بس',
  text_stagger: 'النص يطلع متتابع', stagger_unit_char: 'حرف', stagger_unit_word: 'كلمة', stagger_unit_line: 'سطر',
  stagger_dir_start: 'من البداية', stagger_dir_end: 'من النهاية', stagger_dir_center: 'من الوسط', stagger_dir_random: 'عشوائي',
  stagger_fx_fade: 'ظهور تدريجي', stagger_fx_slide: 'انزلاق', stagger_fx_scale: 'تكبير', stagger_fx_rotate: 'دوران',
  stagger_delay: 'التأخير بين الوحدات', stagger_unit_duration: 'مدة كل وحدة',
  stagger_line_hint: 'السطر = اللي تفصله بـ Shift+Enter داخل النص.',
  templates_btn: 'القوالب', tpl_dialog_title: 'القوالب',
  tpl_ready: 'قوالب جاهزة', tpl_ready_hint: 'ينزل على مقاس لوحتك ويبدّل محتواها — وتقدر تتراجع.', tpl_yours: 'احفظ تصميمك كقالب',
  tpl_mark_slots: 'علّم العناصر اللي تتغيّر، واحفظه قالب',
  tpl_slot_none: 'ليست خانة', tpl_slot_text: 'نص', tpl_slot_image: 'صورة', tpl_slot_color: 'لون',
  tpl_name_ph: 'اسم القالب…', tpl_save: 'حفظ كقالب', tpl_library: 'مكتبة القوالب',
  tpl_empty: 'لا توجد قوالب محفوظة بعد', tpl_apply_motion: 'تطبيق الحركة فقط',
  tpl_fill_apply: 'تعبئة وتطبيق', tpl_delete: 'حذف', tpl_fill_title: 'تعبئة خانات القالب',
  tpl_apply_btn: 'تطبيق على المستند', tpl_slots_label: 'خانة', tpl_cancel: 'إلغاء',
  magic_resize: 'تحجيم سحري', magic_resize_hint: 'يعيد ترتيب العناصر على المقاس الجديد بدل ما يمطّها.',
  ex_magic_resize: 'تحجيم سحري للدفعة',
  local_models_btn: 'النماذج المحلية', local_models_title: 'النماذج المحلية على جهازك',
  local_models_capability_bg: 'إزالة الخلفية', local_models_capability_stt: 'ترجمة تلقائية للمقاطع',
  local_models_capability_sr: 'تحسين دقة الصور', local_models_license: 'الترخيص',
  local_models_download: 'تنزيل', local_models_delete: 'حذف',
  local_models_downloaded: 'مُنزَّل', local_models_not_downloaded: 'غير مُنزَّل',
  local_models_non_commercial: 'غير تجاري — لن يُنزَّل تلقائيًا',
  bg_remove_btn: 'إزالة الخلفية', bg_restore_btn: 'استرجاع الخلفية',
  bg_downloading: 'تنزيل النموذج…', bg_processing: 'معالجة…',
  bg_local_badge: 'يعمل على جهازك — لا تغادر بياناتك',
  upscale_btn: 'تحسين الدقة ×4', upscale_downloading: 'تنزيل النموذج…', upscale_processing: 'تحسين الدقة…',
  upscale_local_badge: 'يعمل على جهازك — لا تغادر بياناتك',
  trace_btn: 'تتبّع إلى متجهات', trace_busy: 'جارٍ التتبّع…',
  trace_hint: 'يحوّل الصورة إلى أشكال تقدر تعدّلها — على جهازك، بدون نت.',
  trace_no_image: 'حدّد صورة أوّلًا.', trace_err_decode: 'تعذّرت قراءة الصورة.',
  trace_err_empty: 'ما يظهر شيء من الصورة داخل إطارها.', trace_err_failed: 'تعذّر التتبّع.',
  trace_bg_name: 'خلفية الصورة', ctx_trace: 'تتبّع الصورة',
  nl_cmd_btn: 'مفسّر الأوامر', nl_cmd_title: 'مفسّر أوامر بلغة طبيعية',
  nl_cmd_hint: 'اكتب أمراً بالعربية أو الإنجليزية — يعمل محلياً بلا إنترنت، ويُنفَّذ عبر نفس طبقة أوامر خادم MCP (البند #20).',
  nl_cmd_ph: 'مثال: كبّر العنوان · غيّر اللون للأخضر · احذف الشعار',
  nl_cmd_run: 'تنفيذ',
  nl_cmd_examples: 'أمثلة: «كبّر العنوان» · «غيّر اللون للأحمر» · «حرّك الشعار لتحت» · «احذف الشارة» · «تراجع»',
  nl_cmd_not_understood: 'لم أفهم — جرّب إعادة الصياغة أو انظر الأمثلة أدناه.',
  nl_cmd_local_badge: 'يعمل على جهازك بقواعد ثابتة — بلا تنزيل وبلا إنترنت',
  nl_cmd_llm_limit: 'نموذج لغوي محلي (مثل Qwen2.5-0.5B) لفهم صياغات أوسع لم يُبنَ بعد — انظر CONTROLS.md لسبب ذلك.',
  refvideo_btn: 'استيراد من فيديو مرجعي', refvideo_title: 'استيراد بنية من فيديو مرجعي',
  refvideo_hint: 'يقرأ تقطيع الفيديو ويبني قالب حركة بخانة صورة لكل لقطة — عبّيها بمحتواك.',
  refvideo_drop: 'اسحب فيديو هنا أو اضغط لاختيار ملف (٣-٣٠ ثانية تقريبًا)', refvideo_pick_btn: 'اختيار فيديو',
  refvideo_analyzing: 'جارِ تحليل الفيديو…',
  refvideo_error_tauri_only: 'تحليل الفيديو يحتاج تطبيق مزيج المُحزَّم (سيدكار FFmpeg) — غير متاح في معاينة المتصفح',
  refvideo_error_generic: 'تعذّر تحليل الفيديو',
  refvideo_shots_found: 'لقطة مكتشفة', refvideo_no_cuts: 'لم يُكتشف أي تقطيع — سيُعامل الفيديو كلقطة واحدة',
  refvideo_beats_soon: 'كشف نبض الموسيقى — قريبًا (FFmpeg القياسي لا يوفّر كاشف نبض صوتي)',
  refvideo_total_duration: 'المدة الإجمالية', refvideo_name_ph: 'اسم القالب…', refvideo_create_btn: 'إنشاء القالب',
  refvideo_cancel: 'إلغاء', refvideo_shot_label: 'لقطة',
  sec_lottie: 'حركة Lottie', choose_lottie: 'اختيار ملف Lottie', replace_lottie: 'استبدال ملف Lottie',
  lottie_loop: 'تكرار الحركة', lottie_invalid: 'ملف Lottie غير صالح',
  lottie_svg_note: 'SVG يحفظ لقطة ثابتة — الحركة في PNG والفيديو.',
  sec_video: 'الفيديو', replace_video: 'استبدال ملف الفيديو', video_trim_in: 'من', video_trim_out: 'إلى', video_volume: 'مستوى الصوت',
  video_muted: 'كتم الصوت', video_loop: 'تكرار التشغيل',
  video_audio_soon: 'صوت الفيديو في التصدير قريب. التكرار شغّال الحين.',
  video_invalid: 'ملف فيديو غير صالح',
  captions_btn: 'إنشاء ترجمة تلقائية', captions_downloading: 'تنزيل نموذج الترجمة…',
  captions_extracting: 'استخراج الصوت…', captions_transcribing: 'تحويل الصوت إلى نص…',
  captions_none_found: 'لم يُعثر على كلام في هذا المقطع', captions_added: 'ترجمة',
  captions_local_badge: 'يعمل على جهازك — لا تغادر بياناتك',
  captions_en_only: 'النموذج الحالي يدعم الإنجليزي بس، والتوقيت بالجملة. كل ترجمة نص عادي تقدر تعدّله.',
  ex_livephoto: 'صورة حية',
  // التعليمة القديمة كانت تقول «AirDrop أو الصور» وهذا خطأ أوقع المالك فعلاً
  // (١٨ أكتوبر ٢٠٢٦): AirDrop ينقل الملفين كعنصرين منفصلين ولا أحد في ذلك المسار
  // يقرأ المعرّف المشترك ليقرنهما، فيظهر على الآيفون فيديو عادي. الإقران تصنعه
  // مكتبة الصور وحدها، ولهذا تشير التعليمة الآن إلى الزر الذي يسلّمها الزوج.
  ex_livephoto_hint: 'يصدّر زوج JPEG+MOV مقترنَين بمعرّف مشترك — اللحظة الحالية على الخط الزمني تصبح اللقطة الثابتة. بعد التصدير اضغط «أضف إلى الصور» ليصير صورة حية حقيقية في مكتبتك وينتقل للآيفون عبر iCloud. نسخ الملفين يدويًا أو إرسالهما بـAirDrop لا يُنتج صورة حية — يصلان كصورة وفيديو منفصلين.',
  ex_lp_add: 'أضف إلى الصور',
  ex_lp_adding: 'يُضاف…',
  ex_lp_added: 'أُضيفت للصور',
  ex_lp_add_hint: 'يسلّم الزوج لمكتبة صور macOS لتقرنهما كصورة حية واحدة',
  ex_livephoto_no_alpha: 'الصورة الحية لا تدعم خلفية شفافة — نصفها الثابت JPEG',
  ex_livephoto_unavailable: 'تصدير الصورة الحية يحتاج تطبيق مزيج المُحزَّم على macOS (أداة AVFoundation أصلية) — غير متوفر في معاينة المتصفح',
  ai_gen_btn: 'توليد AI',
  mcp_btn: 'خادم MCP', mcp_title: 'مزيج كخادم MCP',
  mcp_enable: 'تفعيل الخادم', mcp_port_label: 'المنفذ المحلي',
  mcp_hint: 'يسمح لعميل MCP (مثل كلود) بتنفيذ أوامر حقيقية داخل هذا التطبيق — إنشاء مستند، تعديل عناصر، تصدير ملفات — عبر محادثة نصية.',
  mcp_threat: 'نموذج التهديد: ما دام المفتاح مُطفأً فلا يوجد أي منفذ مفتوح إطلاقًا (تأكَّد بنفسك: lsof -nP -iTCP:7420 لا يُخرج شيئًا). عند التفعيل يُفتح منفذ محلي على 127.0.0.1 فقط، ويُطلب رمز الوصول أدناه في كل طلب — أي طلب بلا رمز يُرفَض بـ401، وأي طلب يحمل ترويسة Origin (أي أنه قادم من صفحة ويب) يُرفَض بـ403، فلا تستطيع أي صفحة تزورها أن تقود التطبيق. يبقى أن أي برنامج آخر على جهازك يملك الرمز يمكنه تنفيذ أوامر حقيقية (كتابة ملفات تصدير، تعديل المستند الحالي) بلا تأكيد إضافي — أطفئه إن لم تكن تستخدمه الآن، فيُغلق المنفذ ويُبطَل الرمز فورًا.',
  mcp_status_on: 'نشط', mcp_status_off: 'متوقف',
  mcp_badge: 'خادم MCP نشط',
  mcp_listening: 'المنفذ مفتوح الآن ومحميّ برمز الوصول',
  mcp_not_listening: 'لا يوجد منفذ مفتوح — لا شيء يستمع على 127.0.0.1:7420 حتى تُشغِّل المفتاح',
  mcp_token_label: 'رمز الوصول (Bearer)',
  mcp_token_hint: 'الصِق هذا الرمز في عميل MCP كترويسة Authorization: Bearer … — يُولَّد رمز جديد عند كل تفعيل، ويُبطَل القديم لحظة الإطفاء.',
  mcp_token_waiting: 'جاري فتح المنفذ…',
  mcp_copy: 'نسخ', mcp_copied: 'تم النسخ',
  mcp_error_label: 'فشل فتح المنفذ',
  text_outline_title: 'تحويل إلى مخطّط', text_outline_btn: 'حوّل النص إلى مخطّط',
  text_outline_converting: 'جارٍ التشكيل والتحويل…',
  text_outline_hint: 'يحوّل الحروف لأشكال بتشكيلها العربي — تطلع نفسها في أي برنامج حتى بدون الخط. بعدها ما تنحرّر كنص، وتقدر تتراجع.',
  text_outline_unsupported_font: 'متاح فقط لخطوط مزيج المدمجة (Alexandria / Readex Pro / Vazirmatn) — هذا الخط مخصّص ولا تتوفر بياناته الثنائية لإعادة التشكيل.',
  text_outline_error: 'فشل التحويل',
  text_on_path_btn: 'نص على مسار منحني', sec_text_on_path: 'نص على مسار',
  text_on_path_hint: 'واحد نص والثاني مسار قلم: اربطهم والنص يمشي على المسار.',
  text_on_path_release: 'فك الربط بالمسار',
  artboards_btn: 'اللوحات', artboards_title: 'لوحات التصميم',
  artboards_add: 'إضافة لوحة', artboards_empty: 'لا توجد لوحات أخرى بعد',
  artboards_name_ph: 'اسم اللوحة…', artboards_switch: 'فتح', artboards_rename: 'إعادة تسمية',
  artboards_duplicate: 'تكرار', artboards_delete: 'حذف',
  artboards_delete_last_hint: 'ما تقدر تحذف آخر لوحة',
  artboards_active_badge: 'نشطة',
  ex_all_artboards: 'تصدير كل اللوحات', ex_all_artboards_hint: 'يصدّر كل اللوحات، مو بس الحالية',
  ex_own_size: 'كل لوحة بمقاسها', ex_own_size_hint: 'كل لوحة بمقاسها — ملف لكل لوحة',
  ex_own_size_note: (n) => `كل لوحة تُصدَّر بمقاسها هي: ${n} ملفات، وقائمة المقاسات أدناه لا تُقرأ في هذا الوضع.`,
  tool_direct: 'تحديد مباشر', tool_hand: 'يد', hint_direct: 'انقر على مسار لتحرير نقاطه', hint_hand: 'اسحب لتحريك اللوحة',
  rail_templates: 'قوالب', rail_text: 'نصوص', rail_elements: 'عناصر', rail_images: 'صور', rail_stickers: 'ملصقات',
  rail_video: 'فيديو', rail_audio: 'صوت', rail_uploads: 'ملفاتي', rail_brand: 'علامتي', rail_fx: 'تأثيرات', rail_label: 'أضف',
  insp_design: 'التصميم', insp_open: 'افتح الخصائص', insp_close: 'اطوِ الخصائص', layers_toggle: 'الطبقات', m_edit_text: 'اكتب', m_duplicate: 'تكرار', m_delete: 'حذف', m_done: 'تم',
  txt_heading: 'أضف عنوان', txt_subheading: 'أضف عنوان فرعي', txt_body: 'أضف نص', txt_styles: 'أنماط جاهزة', txt_hint: 'انقر ويطلع في وسط اللوحة',
  zoom_in: 'كبّر', zoom_out: 'صغّر', zoom_fit: 'ملء الشاشة', tools_label: 'الأدوات',
  sc_title: 'الاختصارات', sc_hint: 'نفس اختصارات أداة المتّجهات والأداة الشائعة ومحرّر الفيديو الشائع، وتشتغل حتى والكيبورد عربي.', sc_general: 'عام', sc_design: 'تصميم ورسم', sc_motion: 'حركة وفيديو', sc_open: 'الاختصارات',
  sc_select: 'تحديد', sc_direct: 'تحديد مباشر (النقاط)', sc_pen: 'قلم', sc_text: 'نص', sc_rect: 'مستطيل', sc_ellipse: 'دائرة', sc_hand: 'يد', sc_image: 'صورة',
  sc_pan: 'تحريك اللوحة (اضغط واسحب)', sc_undo: 'تراجع', sc_redo: 'إعادة', sc_dup: 'كرّر', sc_copy: 'نسخ', sc_paste: 'لصق', sc_cut: 'قص', sc_all: 'حدّد الكل',
  sc_delete: 'احذف', sc_nudge: 'حرّك بكسل (مع شفت: ١٠)', sc_group: 'جمّع', sc_ungroup: 'فكّ التجميع', sc_front: 'للأمام / للخلف خطوة', sc_forward: 'للأمام / للخلف تمامًا', sc_lock: 'اقفل', sc_hide: 'أخفِ',
  sc_zoom: 'كبّر / صغّر', sc_fit: 'ملاءمة الشاشة', sc_actual: '١٠٠٪', sc_search: 'ابحث أو نفّذ أمر', sc_export: 'تصدير', sc_mizo: 'مِزو', sc_esc: 'ارجع خطوة (اخرج من التحرير)',
  sc_play: 'شغّل / وقّف', sc_split: 'قص المقطع عند المؤشر', sc_frame: 'إطار للأمام / للخلف', sc_panels: 'أخفِ اللوحات / أظهرها', sc_edit_text: 'حرّر النص المحدد',
  ctx_font: 'الخط', ctx_size: 'المقاس', ctx_bigger: 'أكبر', ctx_smaller: 'أصغر', ctx_color: 'اللون', ctx_bold: 'عريض', ctx_align: 'المحاذاة',
  ctx_animate: 'حرّك', ctx_more: 'المزيد', ctx_fill: 'التعبئة', ctx_crop: 'قص', ctx_replace: 'بدّل', ctx_edit_points: 'حرّر النقاط',
  ctx_group: 'جمّع', ctx_duplicate: 'كرّر', ctx_delete: 'احذف', ctx_align_sel: 'رتّب', ctx_opacity: 'الشفافية', ctx_position: 'الوضع', ctx_align_page: 'محاذاة إلى الصفحة', align_left: 'يسار', align_center: 'وسط', align_right: 'يمين', align_top: 'أعلى', align_middle: 'منتصف', align_bottom: 'أسفل',
  pages: 'اللوحات', pages_add: 'لوحة جديدة', pages_same_design: 'نفس التصميم بمقاس ثاني', pages_to_reel: 'حوّله لريل',
  up_drop: 'اسحب ملفاتك هنا', stk_builtin: 'ملصقات متحركة', stk_upload: 'ارفع ملف لوتي', up_note_videos: 'مقطع فيديو من جهازك يبدأ عند المؤشّر في وسط اللوحة.', up_note_images: 'صورة من جهازك تنزل في وسط اللوحة. وللنقر في مكانٍ بعينه اضغط حرف الأداة.', up_in_project: 'في هذا المشروع', up_reuse: 'أضِفها مرّةً ثانية', up_pick: 'ارفع ملف', up_note: 'صور، فيديو، أو ملصقات لوتي — تنزل في وسط اللوحة.', brand_pick_hint: 'حدّد نص أو شكل وانقر اللون.',
  sec_timing: 'التوقيت', timing_start: 'البداية', timing_end: 'النهاية', timing_mixed: 'مختلف', timing_from_playhead: 'من المؤشّر', timing_start_here: 'ابدأ المقطع عند المؤشّر (ينقل حركته معه)', timing_end_here: 'أنهِ المقطع عند المؤشّر', clip_bounded: 'يظهر في مقطعه فقط', clip_bounded_hint: 'يختفي قبل بداية مقطعه وبعد نهايته، مثل طبقات الفيديو. بدونه يبقى العنصر ظاهرًا على كامل المقطع.', undo_clip_timing: 'توقيت المقطع', undo_clip_bounded: 'الظهور داخل المقطع', clip_bounded_tip: 'يظهر في مقطعه فقط', clip_unbounded_tip: 'يبقى ظاهرًا قبل مقطعه وبعده',
  prop_trimStart: 'بداية الخط', prop_trimEnd: 'نهاية الخط',
  prop_reveal: 'الظهور', stagger_fx_blur: 'انقشاع', stagger_fx_gather: 'تجمّع', stagger_fx_none: 'فوري', stagger_fx_type: 'كتابة', stagger_type_hint: 'الكتابة تمشي بترتيب القراءة، وكل حرف يظهر بشكله وهو آخر المكتوب', reveal_timing: 'توقيت كل وحدة', reveal_auto_hint: 'تلقائي الحين: كل وحدة بعد اللي قبلها بالتأخير. تبيها مع الصوت؟ وقّف المؤشّر عند أول كلمة واضغط', reveal_next_char: 'الحرف التالي هنا', reveal_next_word: 'الكلمة التالية هنا', reveal_next_line: 'السطر التالي هنا', reveal_next_tip: 'تظهر الوحدة التالية في إطار المؤشّر بالضبط', reveal_clear: 'رجّعها تلقائي', reveal_all_timed: 'كل الوحدات موقّتة', undo_reveal_next: 'توقيت الظهور', undo_reveal_clear: 'إلغاء توقيت الظهور',
  reveal_count: (shown, total) => `ظاهر ${shown} من ${total}`,
  sm_copy_anim: 'نسخ الحركة', sm_paste_anim: 'لصق الحركة', undo_paste_anim: 'لصق الحركة',
  undo_audio_add: 'إضافة صوت', undo_audio_volume: 'مستوى الصوت', undo_audio_mute: 'كتم الصوت', audio_add: 'أضف ملف صوت', audio_add_hint: 'يبدأ عند المؤشّر. يقبل mp3 وm4a وwav — ومقطع فيديو يُؤخذ منه صوته', audio_drop_hint: 'أو اسحب ملف الصوت على اللوحة', audio_in_doc: 'الصوت في المشروع', audio_none: 'ما فيه صوت بعد', sec_audio: 'الصوت', audio_length: 'الطول', audio_file_length: 'طول الملف', audio_volume: 'مستوى الصوت', audio_muted: 'كتم', audio_layer: 'صوت',
  undo_fx_add: 'إضافة مؤثّر', undo_fx_edit: 'تعديل المؤثّر', fx_cat_filter: 'فلاتر', fx_cat_effect: 'مؤثّرات', fx_cat_transition: 'انتقالات', fx_cat_particles: 'جُسيمات', fx_particle_burst: 'انفجار ملوّن', fx_lib_hint: 'اضغط بطاقة تنضاف عند المؤشّر فوق كل الطبقات. اسحب أطرافها في الخط الزمني تحدد متى تبدأ ومتى تنتهي.', sec_fx: 'المؤثّر', fx_amount: 'القوّة', fx_fade_in: 'دخول تدريجي', fx_fade_out: 'خروج تدريجي', fx_kind: 'النوع', fx_layer: 'مؤثّر', fx_peak_hint: 'الانتقال يوصل لأقوى نقطة في منتصف مقطعه. حطه على مكان القطع.', fx_scope_hint: 'يأثر على كل الطبقات اللي تحته. اللي فوقه ما يتأثر.',
  undo_font: 'تغيير الخط', font_from_file: 'أضف خطًّا من جهازك', font_from_file_hint: 'ttf أو otf أو woff — يبقى في مزيج بعد إعادة التشغيل، ويُطبَّق على النص المحدّد', font_system: 'خط مثبّت على الجهاز', font_system_ph: 'اسم الخط، مثل Arial', font_use: 'استخدم', font_remove: 'إزالة من المكتبة', font_system_badge: 'مثبّت',
  font_not_installed: (name) => `«${name}» مو مثبّت على هالجهاز — تأكّد من الاسم أو أضف ملفّه`,
};

export const EN: Dictionary = {
  app: 'Mazij', home: 'Home', saved: 'Saved', saving: 'Saving…', save_error: 'Save failed',
  simple: 'Simple', pro: 'Pro',
  search: 'Search tools & commands', export: 'Export', props: 'Design', assets: 'Library', ai: 'Assistant',
  lang_btn: 'ع', undo: 'Undo', redo: 'Redo', collapse: 'Collapse', duration: '5s · 30fps',
  tool_select: 'Select', tool_text: 'Text', tool_shape: 'Shapes', tool_pen: 'Pen', tool_image: 'Image',
  tool_lottie: 'Lottie', tool_video: 'Video', tool_audio: 'Audio', tool_fx: 'Effects',
  hint_text: 'Click anywhere to add text', hint_shape: 'Drag to draw · Shift constrains (45° for lines) · Option from centre · Space repositions',
  hint_pen: 'Click to add a point · drag for a curve', hint_image: 'Drop an image here or click to choose a file',
  hint_lottie: 'Drop a Lottie file (.json or .lottie) here or click to choose one',
  hint_video: 'Add a video clip as a background or layer', hint_audio: 'Add music or a voiceover',
  hint_fx: 'Filters, effects and transitions',
  img_ph: 'Product photo', fit: 'Fit', timeline: 'Timeline', layers: 'Layers', easing: 'Easing',
  ease_out: 'Ease out', tl_simple_hint: 'Select a layer to pick its entrance motion',
  tl_play: 'Play', tl_pause: 'Pause',
  more_tools: 'Advanced tools',
  pro_mode: 'Pro mode',
  pro_mode_hint: 'أداة متّجهات grip: all handles; corners keep the font size',
  l_bg: 'Background', l_img: 'Image', l_head: 'Headline', l_badge: 'Badge', l_logo: 'Logo',
  anim_none: 'None', anim_fade: 'Fade in', anim_slide: 'Slide up', anim_pop: 'Pop', anim_drop: 'Drop', anim_side: 'Slide in', anim_shrink: 'Shrink', anim_spin: 'Spin', anim_focus: 'Focus',
  align_h: 'Across', align_v: 'Down', al_start: 'Line start', al_center: 'Center', al_end: 'Line end', al_top: 'Top', al_middle: 'Middle', al_bottom: 'Bottom',
  sec_text: 'Text', color: 'Color', align: 'Align', animation: 'Motion', transform: 'Transform',
  tracking: 'Letter spacing',
  justify_kashida: 'Kashida justify',
  blend: 'Blend', effects: 'Effects', stroke: 'Stroke', more: 'Advanced options',
  w_regular: 'Regular', w_medium: 'Medium', w_bold: 'Bold', blend_normal: 'Normal', blend_multiply: 'Multiply', blend_screen: 'Screen', blend_overlay: 'Overlay', blend_darken: 'Darken', blend_lighten: 'Lighten', blend_soft_light: 'Soft light', blend_difference: 'Difference', fx_shadow: 'Drop shadow',
  fx_blur: 'Blur', add_fx: 'Add effect',
  path: 'Path', anchors: 'Anchor points', close_path: 'Close path', boolean: 'Boolean operations', union: 'Union',
  subtract: 'Subtract', intersect: 'Intersect', smooth: 'Smooth', exclude: 'Exclude',
  smooth_amount: 'Smoothing amount', corner_points: 'Corner points',
  corner_points_hint: 'Toggle any point between a smooth curve and a hard corner.',
  point_corner: 'Hard corner — click to smooth', point_smooth: 'Smooth — click to make a corner',
  node_edit_start: 'Edit path points', node_edit_done: 'Done editing points',
  node_edit_hint: 'Drag a point to move it, drag its handle to shape the curve (Alt breaks handle symmetry). Double-click a segment to add a point, Delete removes the selected point, Esc exits.',
  boolean_open_path_hint: 'Open paths can\'t take part in boolean ops — enable "Close path" on them first.',
  boolean_after_create_hint: 'Once the path is finished, select two or more elements (or this path with another shape) to see union/subtract/intersect, and smoothing in the design panel.',
  tab_files: 'Files', tab_fonts: 'Fonts', tab_colors: 'Colors', tab_templates: 'Sizes',
  drop: 'Drop files here or', browse: 'browse', add_font: 'Add font from URL',
  font_url_ph: 'https://example.com/MyFont.ttf', load: 'Load',
  font_note: 'Font licenses are your responsibility. Make sure the link permits your use.',
  loading: 'Downloading…', ready: 'Ready', installed: 'Available fonts', sample: 'Aa Bb Cc',
  project_colors: 'Project colors', brand: 'Brand colors',
  ai_name: 'Mizo',
  ai_welcome: 'Hi! I\'m Mizo. Type a plain command in Arabic or English and I\'ll run it on your real document right away — no internet, no account. Type "help" to see every supported command.',
  ai_ph: 'Type a command…',
  ai_note: 'Local: short fixed commands, instant and offline.',
  ai_eng_local: 'Local', ai_eng_custom: 'Other agent',
  ai_note_agent: 'Runs with your account on this computer and edits the design in front of you.',
  ai_note_custom: 'Any agent that takes a text prompt. It finds the tools URL in MAZIJ_MCP_URL and the token in MAZIJ_MCP_TOKEN.',
  ai_missing: 'Not installed on this computer',
  ai_custom_ph: 'e.g. gemini -p {prompt} --yolo',
  ai_stop: 'Stop', ai_working: 'Working on your design…',
  ai_welcome_agent: 'Hi! I\'m Mizo. Ask in your own words: "make the background blue and enlarge the title", "tidy up the layout". I edit the design directly, and every step can be undone.',
  sug1: 'Make the title bigger', sug2: 'Change the badge color to red', sug3: 'Make the logo half transparent',
  sug4: 'help',
  apply: 'Apply',
  cmd_ph: 'Type a command or tool name…', cmd_hint: '↑↓ navigate · Enter run · Esc close',
  no_results: 'No results',
  ex_title: 'Export', ex_format: 'Format', ex_image: 'Image', ex_video: 'Video', ex_sizes: 'Sizes',
  ex_preview_alt: 'Preview of the current design',
  select_all: 'Select all', quality: 'Quality', q_high: 'High', q_med: 'Medium', scale: 'Scale',
  transparent: 'Transparent background', exporting: 'Exporting…', ex_done: 'Exported',
  open_folder: 'Open folder', cancel: 'Cancel',
  ex_unavailable: 'Video export is Mac-only for now — coming to mobile and the browser', ex_error: 'Export failed', ex_results: 'Results',
  font_error: 'Failed to load', reveal_folder: '~/Mazij/Exports',
  exportN: (n) => (n === 0 ? 'Pick a size' : `Export ${n} file${n === 1 ? '' : 's'}`),
  ex_fps: 'Frame rate', ex_mp4_no_alpha: 'MP4 has no transparency — use GIF instead',
  ex_shutter: 'Motion blur', ex_shutter_off: 'Off', ex_shutter_cost: 'Export takes roughly half this many times longer',
  ex_shutter_preview: 'The preview does not show blur yet — only the exported file does',
  h_greet: 'What are we designing today?', h_prompt_ph: 'Describe your post and let Mizo start…',
  start: 'Start', new_project: 'New project', custom_size: 'Custom size', templates: 'Templates',
  recent: 'Recent',
  t1: 'Sale', t2: 'Listing', t3: 'Notice', t4: 'Steps', t5: 'Before/After', t6: 'App Ad',
  t7: 'Seasonal Sale', t8: 'Centered Quote', t9: 'Job Opening', t10: 'Event Ticket', t11: 'Greeting Card', t12: 'Product Card', t13: 'Infographic', t14: 'Menu', t15: 'Certificate', t16: 'Course Ad',
  rec1: 'Weekend sale', rec2: 'Job opening', rec3: 'Quote of the week',
  time1: '2 hours ago', time2: 'Yesterday', time3: '3 days ago',
  h_search_ph: 'What do you want to make?', h_suggested: 'Suggested',
  h_blank: 'Start from scratch', h_blank_hint: 'An empty artboard at the size you pick — no pre-made content',
  h_medium_all: 'All', h_medium_still: 'Image', h_medium_timed: 'Video',
  h_still: 'Image', h_timed: 'Video',
  h_no_results: (q) => `No results for “${q}”`,
  h_resume: 'Your open project', h_resume_blank: 'Empty artboard', h_resume_cta: 'Continue', h_projects: 'Your projects',
  h_project_age: (ms) => { const m = Math.floor(ms / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; const d = Math.floor(h / 24); return d === 1 ? 'yesterday' : `${d}d ago`; },
  h_elements: (n) => (n === 0 ? 'No elements' : `${n} element${n === 1 ? '' : 's'}`),
  h_artboards: (n) => `${n} artboard${n === 1 ? '' : 's'}`,
  h_projects_soon: 'Multiple projects and a work library',
  h_custom_start: 'Start at this size',
  sel_head: 'Text · Headline', sel_badge: 'Shape · Badge',
  l_discount: 'Discount text', l_generic_text: 'Text', l_generic_shape: 'Shape', l_generic_image: 'Image', l_generic_lottie: 'Lottie animation', l_generic_video: 'Video',
  hide_layer: 'Hide', show_layer: 'Show', shape_rect: 'Rectangle', shape_ellipse: 'Ellipse',
  ln_text: 'Text', ln_rect: 'Rectangle', ln_ellipse: 'Ellipse', ln_path: 'Path', ln_outline: 'Text outline',
  ln_image: 'Image', ln_image_ph: 'Image placeholder', ln_lottie: 'Lottie animation', ln_video: 'Video',
  ln_element: 'Element', ln_group: 'Group',
  organise: 'Organise', lock_layer: 'Lock', unlock_layer: 'Unlock', unlock_all: 'Unlock all', show_all: 'Show all',
  group_selected: 'Group', ungroup_selected: 'Ungroup',
  rename_layer: 'Rename', rename_hint: 'Enter to save · Esc to cancel', locked_badge: 'Locked',
  library: 'Elements',
  lib_soon_body: "This tool's library is still being built — no browsable content grid exists for it yet.",
  lib_soon_tool_active: 'The tool itself is armed on the canvas right now, so its gesture works even though its library does not.',
  shp_how: 'Click a tile to place the shape centred at 30% of the page width · or drag on the canvas for an exact box (Shift constrains, 45° for lines · Option from centre · Space to reposition · ↑↓ for side count)',
  shp_sec_basic: 'Basic shapes', shp_sec_polygons: 'Polygons', shp_sec_stars: 'Stars',
  shp_sec_lines: 'Lines and arrows', shp_sec_flowchart: 'Flowchart and bubbles',
  shape_roundRect: 'Rounded rectangle', shape_triangle: 'Triangle', shape_pentagon: 'Pentagon', shape_hexagon: 'Hexagon', shape_octagon: 'Octagon',
  shape_star5: '5-pointed star', shape_star6: '6-pointed star', shape_star8: '8-pointed star', shape_line: 'Line', shape_arrow: 'Arrow',
  shape_diamond: 'Diamond', shape_bubble: 'Speech bubble',
  sec_shape: 'Shape', sec_image: 'Image', radius: 'Radius', on_state: 'On', off_state: 'Off',
  replace_image: 'Replace image', choose_image: 'Choose image', fit_cover: 'Cover', fit_contain: 'Contain',
  arrange: 'Arrange', bring_forward: 'Forward', send_backward: 'Backward', align_elements: 'Align elements',
  distribute_h: 'Distribute H', distribute_v: 'Distribute V', no_selection: 'Select an element on the canvas to edit it', ex_codec: 'Codec', ex_audio: 'Audio', ex_tip_mp4: 'MP4 — plays everywhere (social, mobile, web)', ex_tip_mov: 'MOV ProRes — edit-grade, keeps a transparent background', ex_tip_webm: 'WebM VP9 — for the web, keeps a transparent background', ex_tip_gif: 'GIF — silent animated image', ex_alpha_note: 'Transparent background: layer this file over other footage in any editor.',
  pen_hint: 'Click to add straight-segment anchor points, then double-click or Enter to finish. Esc to cancel.',
  fit_fill: 'Stretch', crop_frame: 'Crop within frame', crop_start: 'Reposition image', crop_done: 'Done',
  crop_hint: 'Drag the image on the canvas to pan it, and use the zoom slider to scale it.',
  crop_reset: 'Reset position & zoom', zoom: 'Zoom', flip_h: 'Flip H', flip_v: 'Flip V',
  lock_aspect: 'Lock aspect',
  pivot_label: 'Pivot point',
  pivot_hint: 'Animated rotation and scale pivot here — the static angle stays centred',
  pivot_reset: 'Back to centre',
  line_height: 'Line spacing',
  tl_zoom_in: 'Zoom timeline in (⌘ + wheel)',
  tl_zoom_out: 'Zoom timeline out',
  tl_zoom_fit: 'Fit',
  sec_mask: 'Clipping mask', mask_hint: 'One of the two selected elements is a shape — apply it as a clipping mask on the other element (image, text, or shape).',
  clip_mask: 'Clip with shape', release_mask: 'Release mask', post_palettes: 'Color palettes', palette_emerald: 'Emerald & gold',
  decor_title: 'Artboard decoration', decor_accent: 'Accent circle in the corner',
  decor_hint: 'A decoration painted behind your elements in the palette accent. A blank artboard starts without it; starter templates start with it.',
  sec_appearance: 'Appearance stack', appearance_fills: 'Fills', appearance_strokes: 'Strokes', appearance_shadows: 'Shadows',
  appearance_add: '+ Add layer', appearance_empty: 'No layers', stroke_pos_inside: 'Inside', stroke_pos_center: 'Center', stroke_pos_outside: 'Outside',
  shadow_kind_outer: 'Outer', shadow_kind_inner: 'Inner', appearance_gradient: 'Gradient', appearance_radial: 'Radial gradient', appearance_solid: 'Solid',
  stroke_taper: 'Width taper', stroke_taper_none: 'Uniform', stroke_taper_end: 'Taper to end', stroke_taper_start: 'Taper from start',
  stroke_taper_lens: 'Thin at both ends', stroke_taper_pinch: 'Thin in the middle', stroke_taper_custom: 'Custom',
  apply_palette_all: 'Apply palette to every element',
  apply_palette_hint: 'Re-colors every text and shape in the design to the current palette, even elements you manually recolored — one undo step (Cmd+Z to revert).',
  'l_badge-label': 'Badge text', 'l_logo-label': 'Logo text',
  ease_linear: 'Linear', ease_expo: 'Smooth', ease_in: 'Ease in', ease_in_out: 'Ease in-out', ease_back: 'Back', ease_bounce: 'Bounce',
  ease_hold: 'Hold', ease_custom: 'Custom',
  no_easing_target: 'Select an element to edit its easing curve', add_keyframe: 'Add keyframe at playhead',
  delete_keyframe: 'Delete keyframe', kf_value: 'Value', soon: 'Coming soon',
  kf_set_value: 'Keyframe value',
  kf_value_field_hint: 'Type the value exactly — two decimal places. The slider beside it stays for quick approximation.',
  tl_beyond_doc: 'Past the end of the project — this range is not in the exported file. Drag a clip edge out here to make the project longer.',
  split_clip: 'Split', split_consequence: 'produces two separate elements carrying the same text',
  split_no_selection: 'Select a clip to split it', split_locked: 'This layer is locked — unlock it to split',
  split_outside: 'The playhead is outside the selected clip — move it inside to split',
  preset_blocked: 'This element has hand-built animation tracks — applying an entrance preset would erase them, so it is refused. Delete their keyframes first if you want to start over.',
  undo_clip_move: 'Move clip', undo_clip_trim_in: 'Trim clip in', undo_clip_trim_out: 'Trim clip out',
  undo_kf_move: 'Move keyframe',
  prop_opacity: 'Opacity', prop_x: 'Position X', prop_y: 'Position Y', prop_scale: 'Scale', prop_scaleX: 'Width', prop_scaleY: 'Height', prop_rotation: 'Rotation', prop_blur: 'Blur',
  expand_tracks: 'Show property tracks', collapse_tracks: 'Hide property tracks', kf_easing: 'Keyframe easing',
  entrance: 'Entrance',
  exit_anim: 'Exit', exit_none: 'No exit', exit_fade: 'Fade', exit_focus: 'Blur', exit_shrink: 'Shrink', exit_grow: 'Grow', exit_up: 'Rise',
  sec_short: 's',
  ex_estimate: (seconds, files, mb) => `${seconds}s · ${files} file${files === 1 ? '' : 's'} · ≈${mb} MB`,
  ex_only_project_size: 'Project size only', ex_only_project_size_hint: 'Keeps one target: this artboard’s own size',
  ex_video_scale_locked: 'Video exports at the artboard’s own resolution — the multiplier is for still images',
  text_stagger: 'Text stagger', stagger_unit_char: 'Char', stagger_unit_word: 'Word', stagger_unit_line: 'Line',
  stagger_dir_start: 'From start', stagger_dir_end: 'From end', stagger_dir_center: 'From center', stagger_dir_random: 'Random',
  stagger_fx_fade: 'Fade', stagger_fx_slide: 'Slide', stagger_fx_scale: 'Scale', stagger_fx_rotate: 'Rotate',
  stagger_delay: 'Delay between units', stagger_unit_duration: 'Duration per unit',
  stagger_line_hint: '"Line" relies on line breaks you author (Shift+Enter) inside the text, not automatic wrapping — single-line text is treated as one unit.',
  templates_btn: 'Templates', tpl_dialog_title: 'Templates',
  tpl_ready: 'Ready-made templates', tpl_ready_hint: 'The template lands at your current artboard size and replaces its content — one undo step brings it back.', tpl_yours: 'Save your design as a template',
  tpl_mark_slots: 'Mark design elements as fillable slots, then save as a template',
  tpl_slot_none: 'Not a slot', tpl_slot_text: 'Text', tpl_slot_image: 'Image', tpl_slot_color: 'Color',
  tpl_name_ph: 'Template name…', tpl_save: 'Save as template', tpl_library: 'Template library',
  tpl_empty: 'No templates saved yet', tpl_apply_motion: 'Apply motion only',
  tpl_fill_apply: 'Fill & apply', tpl_delete: 'Delete', tpl_fill_title: 'Fill template slots',
  tpl_apply_btn: 'Apply to document', tpl_slots_label: 'slot', tpl_cancel: 'Cancel',
  magic_resize: 'Magic Resize', magic_resize_hint: 'Re-lays-out elements on a size change instead of just stretching them proportionally — keeps circles/photos from distorting and text legible',
  ex_magic_resize: 'Magic Resize for batch',
  local_models_btn: 'Local models', local_models_title: 'Local models on your device',
  local_models_capability_bg: 'Background removal', local_models_capability_stt: 'Auto captions',
  local_models_capability_sr: 'Image upscaling', local_models_license: 'License',
  local_models_download: 'Download', local_models_delete: 'Delete',
  local_models_downloaded: 'Downloaded', local_models_not_downloaded: 'Not downloaded',
  local_models_non_commercial: 'Non-commercial — won’t auto-download',
  bg_remove_btn: 'Remove background', bg_restore_btn: 'Restore background',
  bg_downloading: 'Downloading model…', bg_processing: 'Processing…',
  bg_local_badge: 'Runs on your device — your data never leaves it',
  upscale_btn: 'Enhance resolution ×4', upscale_downloading: 'Downloading model…', upscale_processing: 'Upscaling…',
  upscale_local_badge: 'Runs on your device — your data never leaves it',
  trace_btn: 'Trace to vectors', trace_busy: 'Tracing…',
  trace_hint: 'Turns the image into shapes you can edit — on your device, offline.',
  trace_no_image: 'Select an image first.', trace_err_decode: 'Couldn’t read the image.',
  trace_err_empty: 'None of the image shows inside its frame.', trace_err_failed: 'Tracing failed.',
  trace_bg_name: 'Image background', ctx_trace: 'Image trace',
  nl_cmd_btn: 'Command interpreter', nl_cmd_title: 'Natural-language command interpreter',
  nl_cmd_hint: 'Type a command in Arabic or English — runs fully offline, driving the same tool layer as the MCP server (item #20).',
  nl_cmd_ph: 'e.g. make the title bigger · change the color to green · delete the logo',
  nl_cmd_run: 'Run',
  nl_cmd_examples: 'Examples: "make the title bigger" · "change the color to red" · "move the logo down" · "delete the badge" · "undo"',
  nl_cmd_not_understood: "Didn't understand — try rephrasing, or see the examples below.",
  nl_cmd_local_badge: 'Runs on your device with a fixed rule grammar — no download, no internet',
  nl_cmd_llm_limit: "A local LLM upgrade (e.g. Qwen2.5-0.5B) for broader phrasing isn't built yet — see CONTROLS.md for why.",
  refvideo_btn: 'Import from reference video', refvideo_title: 'Import structure from a reference video',
  refvideo_hint: 'Mazij analyzes the video\'s cut structure (not its pixels) to build a motion template with one image slot per shot — fill them with your own content afterward.',
  refvideo_drop: 'Drop a video here or click to choose a file (roughly 3-30s)', refvideo_pick_btn: 'Choose video',
  refvideo_analyzing: 'Analyzing video…',
  refvideo_error_tauri_only: 'Video analysis needs the packaged Mazij app (FFmpeg sidecar) — unavailable in the browser preview',
  refvideo_error_generic: 'Could not analyze the video',
  refvideo_shots_found: 'shots detected', refvideo_no_cuts: 'No cuts detected — the whole video will be treated as one shot',
  refvideo_beats_soon: 'Music-beat detection — coming soon (stock FFmpeg has no audio onset detector)',
  refvideo_total_duration: 'Total duration', refvideo_name_ph: 'Template name…', refvideo_create_btn: 'Create template',
  refvideo_cancel: 'Cancel', refvideo_shot_label: 'Shot',
  sec_lottie: 'Lottie animation', choose_lottie: 'Choose Lottie file', replace_lottie: 'Replace Lottie file',
  lottie_loop: 'Loop animation', lottie_invalid: 'Invalid Lottie file',
  lottie_svg_note: 'SVG export keeps a frozen snapshot of the current frame only — the real animation plays in PNG and video export.',
  sec_video: 'Video', replace_video: 'Replace video file', video_trim_in: 'In', video_trim_out: 'Out', video_volume: 'Volume',
  video_muted: 'Mute', video_loop: 'Loop playback',
  video_audio_soon: 'Volume/mute coming soon to export — no element kind has an audio track in export yet (PNG/MP4/GIF); visual loop playback is fully wired already.',
  video_invalid: 'Invalid video file',
  captions_btn: 'Generate auto captions', captions_downloading: 'Downloading caption model…',
  captions_extracting: 'Extracting audio…', captions_transcribing: 'Transcribing audio…',
  captions_none_found: 'No speech found in this clip', captions_added: 'caption',
  captions_local_badge: 'Runs on your device — your data never leaves it',
  captions_en_only: 'The current model (Whisper Tiny) is English-only and has limited accuracy — timestamps are sentence-level, not word-level. Every caption is a plain editable text element, including converting it to Arabic.',
  ex_livephoto: 'Live Photo',
  ex_livephoto_hint: 'Exports a JPEG+MOV pair bound by a shared identifier — the current timeline moment becomes the still frame. After exporting, press "Add to Photos" to get a real Live Photo in your library, which iCloud carries to your iPhone. Copying the two files by hand or AirDropping them does not produce a Live Photo — they arrive as a separate photo and video.',
  ex_lp_add: 'Add to Photos',
  ex_lp_adding: 'Adding…',
  ex_lp_added: 'Added to Photos',
  ex_lp_add_hint: 'Hands the pair to the macOS Photos library so it pairs them into one Live Photo',
  ex_livephoto_no_alpha: 'Live Photo has no transparent background — its still half is a JPEG',
  ex_livephoto_unavailable: 'Live Photo export needs the packaged Mazij app on macOS (a native AVFoundation tool) — unavailable in the browser preview',
  ai_gen_btn: 'AI generate',
  mcp_btn: 'MCP server', mcp_title: 'Mazij as an MCP server',
  mcp_enable: 'Enable server', mcp_port_label: 'Local port',
  mcp_hint: 'Lets an MCP client (e.g. Claude) run real commands inside this app — create a document, edit elements, export files — from a chat.',
  mcp_threat: 'Threat model: while this switch is off no port is open at all — check it yourself, `lsof -nP -iTCP:7420` prints nothing. Turning it on opens a port bound to 127.0.0.1 only, and every single request must present the bearer token below: no token is 401, and any request carrying an Origin header (i.e. one made by a web page) is 403, so no site you visit can drive this app. What remains is that another program on your machine that has the token can run real commands (writing export files, editing the current document) with no further confirmation prompt. Turn it off when you are not using it — the port closes and the token dies immediately.',
  mcp_status_on: 'Active', mcp_status_off: 'Off',
  mcp_badge: 'MCP server active',
  mcp_listening: 'Port open now, token required on every request',
  mcp_not_listening: 'No port open — nothing is listening on 127.0.0.1:7420 until you turn this on',
  mcp_token_label: 'Bearer token',
  mcp_token_hint: 'Paste this into your MCP client as the `Authorization: Bearer …` header. A new token is minted on every enable, and the old one dies the moment you switch off.',
  mcp_token_waiting: 'Opening the port…',
  mcp_copy: 'Copy', mcp_copied: 'Copied',
  mcp_error_label: 'Could not open the port',
  text_outline_title: 'Convert to outlines', text_outline_btn: 'Convert text to outlines',
  text_outline_converting: 'Shaping and converting…',
  text_outline_hint: 'Turns the letters into shapes with full Arabic shaping, so the text looks identical anywhere, even without the font. It won’t be editable as text afterward — undo brings it back.',
  text_outline_unsupported_font: 'Only available for Mazij’s built-in fonts (Alexandria / Readex Pro / Vazirmatn) — this is a custom font and its binary data isn’t available to re-shape.',
  text_outline_error: 'Conversion failed',
  text_on_path_btn: 'Text on a curved path', sec_text_on_path: 'Text on path',
  text_on_path_hint: 'One of the two selected elements is text and the other a pen path — attach the text to the path so it bends along its curve (every shaped letter real, never torn apart).',
  text_on_path_release: 'Detach from path',
  artboards_btn: 'Artboards', artboards_title: 'Design artboards',
  artboards_add: 'Add artboard', artboards_empty: 'No other artboards yet',
  artboards_name_ph: 'Artboard name…', artboards_switch: 'Open', artboards_rename: 'Rename',
  artboards_duplicate: 'Duplicate', artboards_delete: 'Delete',
  artboards_delete_last_hint: 'Can’t delete the document’s only artboard',
  artboards_active_badge: 'Active',
  ex_all_artboards: 'Export all artboards', ex_all_artboards_hint: 'Repeats the selected export batch for every artboard in the document, not just the active one',
  ex_own_size: 'Each at its own size', ex_own_size_hint: 'One file per artboard at that artboard\u2019s own size, instead of repeating every selected size on every artboard',
  ex_own_size_note: (n) => `Each artboard exports at its own size: ${n} files. The size list below is ignored in this mode.`,
  tool_direct: 'Direct select', tool_hand: 'Hand', hint_direct: 'Click a path to edit its points', hint_hand: 'Drag to pan the canvas',
  rail_templates: 'Templates', rail_text: 'Text', rail_elements: 'Elements', rail_images: 'Images', rail_stickers: 'Stickers',
  rail_video: 'Video', rail_audio: 'Audio', rail_uploads: 'Uploads', rail_brand: 'Brand', rail_fx: 'Effects', rail_label: 'Add',
  insp_design: 'Design', insp_open: 'Show properties', insp_close: 'Hide properties', layers_toggle: 'Layers', m_edit_text: 'Type', m_duplicate: 'Duplicate', m_delete: 'Delete', m_done: 'Done',
  txt_heading: 'Add a heading', txt_subheading: 'Add a subheading', txt_body: 'Add body text', txt_styles: 'Ready styles', txt_hint: 'Click to add at the centre',
  zoom_in: 'Zoom in', zoom_out: 'Zoom out', zoom_fit: 'Fit', tools_label: 'Tools',
  sc_title: 'Shortcuts', sc_hint: 'The same keys as أداة متّجهات, أداة تصميم شائعة and محرّر فيديو شائع — they work on an Arabic keyboard too.', sc_general: 'General', sc_design: 'Design & drawing', sc_motion: 'Motion & video', sc_open: 'Shortcuts',
  sc_select: 'Select', sc_direct: 'Direct select (points)', sc_pen: 'Pen', sc_text: 'Text', sc_rect: 'Rectangle', sc_ellipse: 'Ellipse', sc_hand: 'Hand', sc_image: 'Image',
  sc_pan: 'Pan (hold and drag)', sc_undo: 'Undo', sc_redo: 'Redo', sc_dup: 'Duplicate', sc_copy: 'Copy', sc_paste: 'Paste', sc_cut: 'Cut', sc_all: 'Select all',
  sc_delete: 'Delete', sc_nudge: 'Nudge 1px (Shift = 10)', sc_group: 'Group', sc_ungroup: 'Ungroup', sc_front: 'Forward / backward', sc_forward: 'To front / to back', sc_lock: 'Lock', sc_hide: 'Hide',
  sc_zoom: 'Zoom in / out', sc_fit: 'Fit', sc_actual: '100%', sc_search: 'Search or run a command', sc_export: 'Export', sc_mizo: 'Mizo', sc_esc: 'Step back (leave editing)',
  sc_play: 'Play / pause', sc_split: 'Split clip at playhead', sc_frame: 'Frame forward / back', sc_panels: 'Hide / show panels', sc_edit_text: 'Edit selected text',
  ctx_font: 'Font', ctx_size: 'Size', ctx_bigger: 'Bigger', ctx_smaller: 'Smaller', ctx_color: 'Colour', ctx_bold: 'Bold', ctx_align: 'Align',
  ctx_animate: 'Animate', ctx_more: 'More', ctx_fill: 'Fill', ctx_crop: 'Crop', ctx_replace: 'Replace', ctx_edit_points: 'Edit points',
  ctx_group: 'Group', ctx_duplicate: 'Duplicate', ctx_delete: 'Delete', ctx_align_sel: 'Arrange', ctx_opacity: 'Transparency', ctx_position: 'Position', ctx_align_page: 'Align to page', align_left: 'Left', align_center: 'Centre', align_right: 'Right', align_top: 'Top', align_middle: 'Middle', align_bottom: 'Bottom',
  pages: 'Artboards', pages_add: 'New artboard', pages_same_design: 'Same design, another size', pages_to_reel: 'Make it a reel',
  up_drop: 'Drop files here', stk_builtin: 'Animated stickers', stk_upload: 'Upload a Lottie file', up_note_videos: 'A video clip from your computer starts at the playhead, centred.', up_note_images: 'An image from your computer lands at the centre. To click a spot, press the tool key.', up_in_project: 'In this project', up_reuse: 'Add it again', up_pick: 'Upload a file', up_note: 'Images, video or Lottie stickers — they land at the centre.', brand_pick_hint: 'Select a text or shape, then click a colour.',
  sec_timing: 'Timing', timing_start: 'Start', timing_end: 'End', timing_mixed: 'Mixed', timing_from_playhead: 'From playhead', timing_start_here: 'Start the clip at the playhead (its motion moves with it)', timing_end_here: 'End the clip at the playhead', clip_bounded: 'Visible only during its clip', clip_bounded_hint: 'Hidden before its clip starts and after it ends, like video layers. Without it the element stays on screen for the whole piece.', undo_clip_timing: 'Clip timing', undo_clip_bounded: 'Visible during clip', clip_bounded_tip: 'Visible only during this clip', clip_unbounded_tip: 'Stays visible before and after this clip',
  prop_trimStart: 'Line start', prop_trimEnd: 'Line end',
  prop_reveal: 'Reveal', stagger_fx_blur: 'Unblur', stagger_fx_gather: 'Gather', stagger_fx_none: 'Instant', stagger_fx_type: 'Typing', stagger_type_hint: 'Typing follows reading order; each new letter shows the shape it has as the last one typed', reveal_timing: 'Per-unit timing', reveal_auto_hint: 'Automatic now: each unit follows the last by the delay. Want it on the voice? Park the playhead on the first word and press', reveal_next_char: 'Next letter here', reveal_next_word: 'Next word here', reveal_next_line: 'Next line here', reveal_next_tip: 'The next unit appears on the playhead\'s exact frame', reveal_clear: 'Back to automatic', reveal_all_timed: 'Every unit is timed', undo_reveal_next: 'Reveal timing', undo_reveal_clear: 'Clear reveal timing',
  reveal_count: (shown, total) => `${shown} of ${total} shown`,
  sm_copy_anim: 'Copy animation', sm_paste_anim: 'Paste animation', undo_paste_anim: 'Paste animation',
  undo_audio_add: 'Add audio', undo_audio_volume: 'Volume', undo_audio_mute: 'Mute', audio_add: 'Add an audio file', audio_add_hint: 'Starts at the playhead. Takes mp3, m4a, wav — or a video, keeping its sound', audio_drop_hint: 'Or drop an audio file on the canvas', audio_in_doc: 'Audio in this project', audio_none: 'No audio yet', sec_audio: 'Audio', audio_length: 'Length', audio_file_length: 'File length', audio_volume: 'Volume', audio_muted: 'Mute', audio_layer: 'Audio',
  undo_fx_add: 'Add effect', undo_fx_edit: 'Edit effect', fx_cat_filter: 'Filters', fx_cat_effect: 'Effects', fx_cat_transition: 'Transitions', fx_cat_particles: 'Particles', fx_particle_burst: 'Color burst', fx_lib_hint: 'Click a card to add it at the playhead above every layer. Drag its edges on the timeline to set when it starts and ends.', sec_fx: 'Effect', fx_amount: 'Strength', fx_fade_in: 'Fade in', fx_fade_out: 'Fade out', fx_kind: 'Type', fx_layer: 'Effect', fx_peak_hint: 'A transition peaks in the middle of its clip. Place it on the cut.', fx_scope_hint: 'Affects every layer below it. Layers above stay untouched.',
  undo_font: 'Change font', font_from_file: 'Add a font from your device', font_from_file_hint: 'ttf, otf or woff — stays in Mazij after restart, and applies to the selected text', font_system: 'A font installed on this device', font_system_ph: 'Font name, e.g. Arial', font_use: 'Use', font_remove: 'Remove from library', font_system_badge: 'Installed',
  font_not_installed: (name) => `“${name}” isn't installed on this device — check the name or add its file`,
};

export const DICTS: Record<Lang, Dictionary> = { ar: AR, en: EN };
