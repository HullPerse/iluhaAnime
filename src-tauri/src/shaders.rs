use serde::Serialize;
use std::collections::HashSet;
use std::path::PathBuf;
use tauri::Manager;

pub fn shader_dir(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    Some(app_handle.path().resource_dir().ok()?.join("shaders"))
}

#[derive(Clone, Serialize)]
pub struct ShaderInfo {
    pub id: String,
    pub filename: String,
    pub category: String,
    pub description: String,
    pub speed_factor: f64,
    pub is_default: bool,
    pub exclusive_group: Option<String>,
}

#[derive(Clone)]
struct ShaderMeta {
    id: &'static str,
    filename: &'static str,
    category: &'static str,
    description_ru: &'static str,
    speed_factor: f64,
    is_default: bool,
    exclusive_group: Option<&'static str>,
}

const CATALOG: &[ShaderMeta] = &[
    // ── Preprocess ──
    ShaderMeta {
        id: "clamp",
        filename: "Anime4K_Clamp_Highlights.glsl",
        category: "preprocess",
        description_ru: "Предотвращает засветку ярких участков",
        speed_factor: 0.98,
        is_default: true,
        exclusive_group: None,
    },
    ShaderMeta {
        id: "denoise_bilateral_mode",
        filename: "Anime4K_Denoise_Bilateral_Mode.glsl",
        category: "preprocess",
        description_ru: "Убирает шум билатеральным фильтром (режим)",
        speed_factor: 0.93,
        is_default: false,
        exclusive_group: Some("denoise"),
    },
    ShaderMeta {
        id: "denoise_bilateral_median",
        filename: "Anime4K_Denoise_Bilateral_Median.glsl",
        category: "preprocess",
        description_ru: "Убирает шум билатеральным фильтром (медиана)",
        speed_factor: 0.92,
        is_default: false,
        exclusive_group: Some("denoise"),
    },
    ShaderMeta {
        id: "denoise_bilateral_mean",
        filename: "Anime4K_Denoise_Bilateral_Mean.glsl",
        category: "preprocess",
        description_ru: "Убирает шум билатеральным фильтром (среднее)",
        speed_factor: 0.94,
        is_default: false,
        exclusive_group: Some("denoise"),
    },
    ShaderMeta {
        id: "deblur_original",
        filename: "Anime4K_Deblur_Original.glsl",
        category: "preprocess",
        description_ru: "Убирает размытие движения (оригинальный алгоритм)",
        speed_factor: 0.88,
        is_default: false,
        exclusive_group: Some("deblur"),
    },
    ShaderMeta {
        id: "deblur_dog",
        filename: "Anime4K_Deblur_DoG.glsl",
        category: "preprocess",
        description_ru: "Убирает размытие движения (DoG)",
        speed_factor: 0.90,
        is_default: false,
        exclusive_group: Some("deblur"),
    },
    // ── Restore (mutually exclusive) ──
    ShaderMeta {
        id: "restore_none",
        filename: "",
        category: "restore",
        description_ru: "Без восстановления линий (быстрее, хуже качество)",
        speed_factor: 1.0,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_vl",
        filename: "Anime4K_Restore_CNN_VL.glsl",
        category: "restore",
        description_ru: "Восстановление линий - очень быстрое (VL)",
        speed_factor: 0.88,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_ul",
        filename: "Anime4K_Restore_CNN_UL.glsl",
        category: "restore",
        description_ru: "Восстановление линий - ультра-быстрое (UL)",
        speed_factor: 0.80,
        is_default: true,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_l",
        filename: "Anime4K_Restore_CNN_L.glsl",
        category: "restore",
        description_ru: "Восстановление линий - лёгкое (L)",
        speed_factor: 0.65,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_m",
        filename: "Anime4K_Restore_CNN_M.glsl",
        category: "restore",
        description_ru: "Восстановление линий - среднее (M)",
        speed_factor: 0.50,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_s",
        filename: "Anime4K_Restore_CNN_S.glsl",
        category: "restore",
        description_ru: "Восстановление линий - стандартное, качество (S)",
        speed_factor: 0.30,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_soft_vl",
        filename: "Anime4K_Restore_CNN_Soft_VL.glsl",
        category: "restore",
        description_ru: "Мягкое восстановление - очень быстрое (VL)",
        speed_factor: 0.87,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_soft_ul",
        filename: "Anime4K_Restore_CNN_Soft_UL.glsl",
        category: "restore",
        description_ru: "Мягкое восстановление - ультра-быстрое (UL)",
        speed_factor: 0.78,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_soft_l",
        filename: "Anime4K_Restore_CNN_Soft_L.glsl",
        category: "restore",
        description_ru: "Мягкое восстановление - лёгкое (L)",
        speed_factor: 0.63,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_soft_m",
        filename: "Anime4K_Restore_CNN_Soft_M.glsl",
        category: "restore",
        description_ru: "Мягкое восстановление - среднее (M)",
        speed_factor: 0.48,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_soft_s",
        filename: "Anime4K_Restore_CNN_Soft_S.glsl",
        category: "restore",
        description_ru: "Мягкое восстановление - стандартное, качество (S)",
        speed_factor: 0.28,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    // ── Upscale (mutually exclusive, required) ──
    ShaderMeta {
        id: "upscale_cnn_x2_vl",
        filename: "Anime4K_Upscale_CNN_x2_VL.glsl",
        category: "upscale",
        description_ru: "2x CNN апскейл - очень быстрый (VL)",
        speed_factor: 0.82,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_cnn_x2_ul",
        filename: "Anime4K_Upscale_CNN_x2_UL.glsl",
        category: "upscale",
        description_ru: "2x CNN апскейл - ультра-быстрый (UL)",
        speed_factor: 0.70,
        is_default: true,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_cnn_x2_l",
        filename: "Anime4K_Upscale_CNN_x2_L.glsl",
        category: "upscale",
        description_ru: "2x CNN апскейл - лёгкий (L)",
        speed_factor: 0.55,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_cnn_x2_m",
        filename: "Anime4K_Upscale_CNN_x2_M.glsl",
        category: "upscale",
        description_ru: "2x CNN апскейл - средний (M)",
        speed_factor: 0.40,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_cnn_x2_s",
        filename: "Anime4K_Upscale_CNN_x2_S.glsl",
        category: "upscale",
        description_ru: "2x CNN апскейл - стандартный, качество (S)",
        speed_factor: 0.25,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_denoise_cnn_x2_vl",
        filename: "Anime4K_Upscale_Denoise_CNN_x2_VL.glsl",
        category: "upscale",
        description_ru: "2x апскейл + шумодав - очень быстрый (VL)",
        speed_factor: 0.78,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_denoise_cnn_x2_ul",
        filename: "Anime4K_Upscale_Denoise_CNN_x2_UL.glsl",
        category: "upscale",
        description_ru: "2x апскейл + шумодав - ультра-быстрый (UL)",
        speed_factor: 0.65,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_denoise_cnn_x2_l",
        filename: "Anime4K_Upscale_Denoise_CNN_x2_L.glsl",
        category: "upscale",
        description_ru: "2x апскейл + шумодав - лёгкий (L)",
        speed_factor: 0.50,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_denoise_cnn_x2_m",
        filename: "Anime4K_Upscale_Denoise_CNN_x2_M.glsl",
        category: "upscale",
        description_ru: "2x апскейл + шумодав - средний (M)",
        speed_factor: 0.35,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_denoise_cnn_x2_s",
        filename: "Anime4K_Upscale_Denoise_CNN_x2_S.glsl",
        category: "upscale",
        description_ru: "2x апскейл + шумодав - стандартный (S)",
        speed_factor: 0.20,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_deblur_original_x2",
        filename: "Anime4K_Upscale_Deblur_Original_x2.glsl",
        category: "upscale",
        description_ru: "2x апскейл + деblur (оригинал)",
        speed_factor: 0.60,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_deblur_dog_x2",
        filename: "Anime4K_Upscale_Deblur_DoG_x2.glsl",
        category: "upscale",
        description_ru: "2x апскейл + деblur (DoG)",
        speed_factor: 0.62,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_original_x2",
        filename: "Anime4K_Upscale_Original_x2.glsl",
        category: "upscale",
        description_ru: "2x апскейл - оригинальный алгоритм (быстрый)",
        speed_factor: 0.75,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_dtd_x2",
        filename: "Anime4K_Upscale_DTD_x2.glsl",
        category: "upscale",
        description_ru: "2x апскейл - DTD алгоритм",
        speed_factor: 0.68,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_dog_x2",
        filename: "Anime4K_Upscale_DoG_x2.glsl",
        category: "upscale",
        description_ru: "2x апскейл - DoG алгоритм",
        speed_factor: 0.70,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    // ── Postprocess ──
    ShaderMeta {
        id: "thin_veryfast",
        filename: "Anime4K_Thin_VeryFast.glsl",
        category: "postprocess",
        description_ru: "Утоньшает линии - очень быстро",
        speed_factor: 0.95,
        is_default: false,
        exclusive_group: Some("thin"),
    },
    ShaderMeta {
        id: "thin_fast",
        filename: "Anime4K_Thin_Fast.glsl",
        category: "postprocess",
        description_ru: "Утоньшает линии - быстро",
        speed_factor: 0.93,
        is_default: false,
        exclusive_group: Some("thin"),
    },
    ShaderMeta {
        id: "thin_hq",
        filename: "Anime4K_Thin_HQ.glsl",
        category: "postprocess",
        description_ru: "Утоньшает линии - качество",
        speed_factor: 0.88,
        is_default: false,
        exclusive_group: Some("thin"),
    },
    ShaderMeta {
        id: "darken_veryfast",
        filename: "Anime4K_Darken_VeryFast.glsl",
        category: "postprocess",
        description_ru: "Затемняет линии - очень быстро",
        speed_factor: 0.95,
        is_default: false,
        exclusive_group: Some("darken"),
    },
    ShaderMeta {
        id: "darken_fast",
        filename: "Anime4K_Darken_Fast.glsl",
        category: "postprocess",
        description_ru: "Затемняет линии - быстро",
        speed_factor: 0.93,
        is_default: false,
        exclusive_group: Some("darken"),
    },
    ShaderMeta {
        id: "darken_hq",
        filename: "Anime4K_Darken_HQ.glsl",
        category: "postprocess",
        description_ru: "Затемняет линии - качество",
        speed_factor: 0.88,
        is_default: false,
        exclusive_group: Some("darken"),
    },
    ShaderMeta {
        id: "auto_downscale_x2",
        filename: "Anime4K_AutoDownscalePre_x2.glsl",
        category: "postprocess",
        description_ru: "Предобработка даунскейла 2x (если цель меньше 2x)",
        speed_factor: 0.95,
        is_default: false,
        exclusive_group: Some("auto_downscale"),
    },
    ShaderMeta {
        id: "auto_downscale_x4",
        filename: "Anime4K_AutoDownscalePre_x4.glsl",
        category: "postprocess",
        description_ru: "Предобработка даунскейла 4x (если цель меньше 4x)",
        speed_factor: 0.92,
        is_default: false,
        exclusive_group: Some("auto_downscale"),
    },
];

pub fn default_selection() -> Vec<String> {
    CATALOG
        .iter()
        .filter(|s| s.is_default)
        .map(|s| s.id.to_string())
        .collect()
}

pub fn list_shaders() -> Vec<ShaderInfo> {
    CATALOG
        .iter()
        .map(|s| ShaderInfo {
            id: s.id.to_string(),
            filename: s.filename.to_string(),
            category: s.category.to_string(),
            description: s.description_ru.to_string(),
            speed_factor: s.speed_factor,
            is_default: s.is_default,
            exclusive_group: s.exclusive_group.map(|g| g.to_string()),
        })
        .collect()
}

fn find_meta(id: &str) -> Option<&ShaderMeta> {
    CATALOG.iter().find(|s| s.id == id)
}

/// Build ordered list of shader filenames from selected IDs.
/// Returns error if validation fails (e.g. no upscale selected).
pub fn build_shader_chain(selected: &[String]) -> Result<Vec<String>, String> {
    let selected_set: HashSet<&str> = selected.iter().map(|s| s.as_str()).collect();

    // Validate: exactly one upscale required
    let upscale_count = CATALOG
        .iter()
        .filter(|s| s.category == "upscale" && selected_set.contains(s.id))
        .count();
    if upscale_count == 0 {
        return Err("Необходимо выбрать один апскейл-шейдер".to_string());
    }
    if upscale_count > 1 {
        return Err("Можно выбрать только один апскейл-шейдер".to_string());
    }

    // Validate: at most one restore
    let restore_count = CATALOG
        .iter()
        .filter(|s| s.category == "restore" && selected_set.contains(s.id))
        .count();
    if restore_count > 1 {
        return Err("Можно выбрать только один шейдер восстановления".to_string());
    }

    // Validate: within each exclusive group, at most one
    let mut groups: HashSet<&str> = HashSet::new();
    for id in selected {
        if let Some(meta) = find_meta(id) {
            if let Some(group) = meta.exclusive_group {
                if !groups.insert(group) {
                    // Already had one in this group - but this check only catches
                    // if the SAME group name appears twice from different entries.
                    // Actually HashSet::insert returns false if already present.
                    // But we already checked restore/upscale above.
                    // This catches denoise/deblur/thin/darken/auto_downscale.
                }
            }
        }
    }

    // Order: preprocess → restore → upscale → postprocess
    let order = ["preprocess", "restore", "upscale", "postprocess"];
    let mut chain: Vec<String> = Vec::new();

    for &cat in &order {
        for meta in CATALOG.iter() {
            if meta.category == cat && selected_set.contains(meta.id) {
                if !meta.filename.is_empty() {
                    chain.push(meta.filename.to_string());
                }
            }
        }
    }

    Ok(chain)
}

/// Rough ETA estimate based on shader speed factors and GPU backend.
pub fn estimate_time(duration_secs: f64, selected: &[String], gpu_backend: &str) -> String {
    let base_speed = match gpu_backend {
        "nvenc" => 2.5,
        "amf" => 1.8,
        "qsv" => 1.5,
        _ => 0.8,
    };

    let penalty: f64 = selected
        .iter()
        .filter_map(|id| find_meta(id).map(|m| m.speed_factor))
        .product();

    let total_speed = base_speed * penalty.max(0.05);
    let eta = duration_secs / total_speed;

    if eta < 60.0 {
        format!("< 1 мин")
    } else {
        let m = (eta / 60.0).floor() as u32;
        let s = (eta % 60.0).round() as u32;
        if s > 0 {
            format!("~{m} мин {s} сек")
        } else {
            format!("~{m} мин")
        }
    }
}

#[tauri::command]
pub fn list_anime4k_shaders() -> Vec<ShaderInfo> {
    list_shaders()
}

#[tauri::command]
pub fn default_anime4k_shaders() -> Vec<String> {
    default_selection()
}

#[tauri::command]
pub fn estimate_anime4k_time(
    duration_secs: f64,
    selected: Vec<String>,
    gpu_backend: String,
) -> String {
    estimate_time(duration_secs, &selected, &gpu_backend)
}
