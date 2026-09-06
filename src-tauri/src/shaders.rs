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
    ShaderMeta {
        id: "clamp",
        filename: "Anime4K_Clamp_Highlights.glsl",
        category: "preprocess",
        description_ru: "Предотвращает засветку ярких участков",
        speed_factor: 1.0,
        is_default: true,
        exclusive_group: None,
    },
    ShaderMeta {
        id: "denoise_bilateral_mode",
        filename: "Anime4K_Denoise_Bilateral_Mode.glsl",
        category: "preprocess",
        description_ru: "Убирает шум билатеральным фильтром (режим)",
        speed_factor: 0.81,
        is_default: false,
        exclusive_group: Some("denoise"),
    },
    ShaderMeta {
        id: "denoise_bilateral_median",
        filename: "Anime4K_Denoise_Bilateral_Median.glsl",
        category: "preprocess",
        description_ru: "Убирает шум билатеральным фильтром (медиана)",
        speed_factor: 0.76,
        is_default: false,
        exclusive_group: Some("denoise"),
    },
    ShaderMeta {
        id: "denoise_bilateral_mean",
        filename: "Anime4K_Denoise_Bilateral_Mean.glsl",
        category: "preprocess",
        description_ru: "Убирает шум билатеральным фильтром (среднее)",
        speed_factor: 0.85,
        is_default: false,
        exclusive_group: Some("denoise"),
    },
    ShaderMeta {
        id: "deblur_original",
        filename: "Anime4K_Deblur_Original.glsl",
        category: "preprocess",
        description_ru: "Убирает размытие движения (оригинальный алгоритм)",
        speed_factor: 0.79,
        is_default: false,
        exclusive_group: Some("deblur"),
    },
    ShaderMeta {
        id: "deblur_dog",
        filename: "Anime4K_Deblur_DoG.glsl",
        category: "preprocess",
        description_ru: "Убирает размытие движения (DoG)",
        speed_factor: 0.85,
        is_default: false,
        exclusive_group: Some("deblur"),
    },
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
        speed_factor: 0.58,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_ul",
        filename: "Anime4K_Restore_CNN_UL.glsl",
        category: "restore",
        description_ru: "Восстановление линий - ультра-быстрое (UL)",
        speed_factor: 0.45,
        is_default: true,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_l",
        filename: "Anime4K_Restore_CNN_L.glsl",
        category: "restore",
        description_ru: "Восстановление линий - лёгкое (L)",
        speed_factor: 0.67,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_m",
        filename: "Anime4K_Restore_CNN_M.glsl",
        category: "restore",
        description_ru: "Восстановление линий - среднее (M)",
        speed_factor: 0.71,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_s",
        filename: "Anime4K_Restore_CNN_S.glsl",
        category: "restore",
        description_ru: "Восстановление линий - стандартное, качество (S)",
        speed_factor: 0.73,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_soft_vl",
        filename: "Anime4K_Restore_CNN_Soft_VL.glsl",
        category: "restore",
        description_ru: "Мягкое восстановление - очень быстрое (VL)",
        speed_factor: 0.52,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_soft_ul",
        filename: "Anime4K_Restore_CNN_Soft_UL.glsl",
        category: "restore",
        description_ru: "Мягкое восстановление - ультра-быстрое (UL)",
        speed_factor: 0.44,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_soft_l",
        filename: "Anime4K_Restore_CNN_Soft_L.glsl",
        category: "restore",
        description_ru: "Мягкое восстановление - лёгкое (L)",
        speed_factor: 0.71,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_soft_m",
        filename: "Anime4K_Restore_CNN_Soft_M.glsl",
        category: "restore",
        description_ru: "Мягкое восстановление - среднее (M)",
        speed_factor: 0.73,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_cnn_soft_s",
        filename: "Anime4K_Restore_CNN_Soft_S.glsl",
        category: "restore",
        description_ru: "Мягкое восстановление - стандартное, качество (S)",
        speed_factor: 0.81,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_gan_ul",
        filename: "Anime4K_Restore_GAN_UL.glsl",
        category: "restore",
        description_ru: "GAN восстановление - экспериментальное (UL)",
        speed_factor: 0.5,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "restore_gan_uul",
        filename: "Anime4K_Restore_GAN_UUL.glsl",
        category: "restore",
        description_ru: "GAN восстановление - экспериментальное (UUL)",
        speed_factor: 0.54,
        is_default: false,
        exclusive_group: Some("restore"),
    },
    ShaderMeta {
        id: "upscale_cnn_x2_vl",
        filename: "Anime4K_Upscale_CNN_x2_VL.glsl",
        category: "upscale",
        description_ru: "2x CNN апскейл - очень быстрый (VL)",
        speed_factor: 0.65,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_cnn_x2_ul",
        filename: "Anime4K_Upscale_CNN_x2_UL.glsl",
        category: "upscale",
        description_ru: "2x CNN апскейл - ультра-быстрый (UL)",
        speed_factor: 0.51,
        is_default: true,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_cnn_x2_l",
        filename: "Anime4K_Upscale_CNN_x2_L.glsl",
        category: "upscale",
        description_ru: "2x CNN апскейл - лёгкий (L)",
        speed_factor: 0.85,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_cnn_x2_m",
        filename: "Anime4K_Upscale_CNN_x2_M.glsl",
        category: "upscale",
        description_ru: "2x CNN апскейл - средний (M)",
        speed_factor: 0.92,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_cnn_x2_s",
        filename: "Anime4K_Upscale_CNN_x2_S.glsl",
        category: "upscale",
        description_ru: "2x CNN апскейл - стандартный, качество (S)",
        speed_factor: 1.0,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_denoise_cnn_x2_vl",
        filename: "Anime4K_Upscale_Denoise_CNN_x2_VL.glsl",
        category: "upscale",
        description_ru: "2x апскейл + шумодав - очень быстрый (VL)",
        speed_factor: 0.65,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_denoise_cnn_x2_ul",
        filename: "Anime4K_Upscale_Denoise_CNN_x2_UL.glsl",
        category: "upscale",
        description_ru: "2x апскейл + шумодав - ультра-быстрый (UL)",
        speed_factor: 0.5,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_denoise_cnn_x2_l",
        filename: "Anime4K_Upscale_Denoise_CNN_x2_L.glsl",
        category: "upscale",
        description_ru: "2x апскейл + шумодав - лёгкий (L)",
        speed_factor: 0.85,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_denoise_cnn_x2_m",
        filename: "Anime4K_Upscale_Denoise_CNN_x2_M.glsl",
        category: "upscale",
        description_ru: "2x апскейл + шумодав - средний (M)",
        speed_factor: 0.92,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_denoise_cnn_x2_s",
        filename: "Anime4K_Upscale_Denoise_CNN_x2_S.glsl",
        category: "upscale",
        description_ru: "2x апскейл + шумодав - стандартный (S)",
        speed_factor: 1.0,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_deblur_original_x2",
        filename: "Anime4K_Upscale_Deblur_Original_x2.glsl",
        category: "upscale",
        description_ru: "2x апскейл + деблур (оригинал)",
        speed_factor: 0.79,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_deblur_dog_x2",
        filename: "Anime4K_Upscale_Deblur_DoG_x2.glsl",
        category: "upscale",
        description_ru: "2x апскейл + деблур (DoG)",
        speed_factor: 0.85,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_original_x2",
        filename: "Anime4K_Upscale_Original_x2.glsl",
        category: "upscale",
        description_ru: "2x апскейл - оригинальный алгоритм (быстрый)",
        speed_factor: 1.0,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_dtd_x2",
        filename: "Anime4K_Upscale_DTD_x2.glsl",
        category: "upscale",
        description_ru: "2x апскейл - DTD алгоритм",
        speed_factor: 0.88,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_dog_x2",
        filename: "Anime4K_Upscale_DoG_x2.glsl",
        category: "upscale",
        description_ru: "2x апскейл - DoG алгоритм",
        speed_factor: 1.0,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_gan_x2_s",
        filename: "Anime4K_Upscale_GAN_x2_S.glsl",
        category: "upscale",
        description_ru: "2x GAN апскейл - экспериментальный (S)",
        speed_factor: 0.79,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_gan_x2_m",
        filename: "Anime4K_Upscale_GAN_x2_M.glsl",
        category: "upscale",
        description_ru: "2x GAN апскейл - экспериментальный (M)",
        speed_factor: 0.61,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_gan_x3_l",
        filename: "Anime4K_Upscale_GAN_x3_L.glsl",
        category: "upscale",
        description_ru: "3x GAN апскейл - экспериментальный (L)",
        speed_factor: 0.33,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_gan_x3_vl",
        filename: "Anime4K_Upscale_GAN_x3_VL.glsl",
        category: "upscale",
        description_ru: "3x GAN апскейл - экспериментальный (VL)",
        speed_factor: 0.21,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_gan_x4_ul",
        filename: "Anime4K_Upscale_GAN_x4_UL.glsl",
        category: "upscale",
        description_ru: "4x GAN апскейл - экспериментальный (UL)",
        speed_factor: 0.13,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "upscale_gan_x4_uul",
        filename: "Anime4K_Upscale_GAN_x4_UUL.glsl",
        category: "upscale",
        description_ru: "4x GAN апскейл - экспериментальный (UUL)",
        speed_factor: 0.07,
        is_default: false,
        exclusive_group: Some("upscale"),
    },
    ShaderMeta {
        id: "thin_veryfast",
        filename: "Anime4K_Thin_VeryFast.glsl",
        category: "postprocess",
        description_ru: "Утоньшает линии - очень быстро",
        speed_factor: 0.79,
        is_default: false,
        exclusive_group: Some("thin"),
    },
    ShaderMeta {
        id: "thin_fast",
        filename: "Anime4K_Thin_Fast.glsl",
        category: "postprocess",
        description_ru: "Утоньшает линии - быстро",
        speed_factor: 0.79,
        is_default: false,
        exclusive_group: Some("thin"),
    },
    ShaderMeta {
        id: "thin_hq",
        filename: "Anime4K_Thin_HQ.glsl",
        category: "postprocess",
        description_ru: "Утоньшает линии - качество",
        speed_factor: 0.79,
        is_default: false,
        exclusive_group: Some("thin"),
    },
    ShaderMeta {
        id: "darken_veryfast",
        filename: "Anime4K_Darken_VeryFast.glsl",
        category: "postprocess",
        description_ru: "Затемняет линии - очень быстро",
        speed_factor: 0.85,
        is_default: false,
        exclusive_group: Some("darken"),
    },
    ShaderMeta {
        id: "darken_fast",
        filename: "Anime4K_Darken_Fast.glsl",
        category: "postprocess",
        description_ru: "Затемняет линии - быстро",
        speed_factor: 0.76,
        is_default: false,
        exclusive_group: Some("darken"),
    },
    ShaderMeta {
        id: "darken_hq",
        filename: "Anime4K_Darken_HQ.glsl",
        category: "postprocess",
        description_ru: "Затемняет линии - качество",
        speed_factor: 0.81,
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
            exclusive_group: s.exclusive_group.map(std::string::ToString::to_string),
        })
        .collect()
}

fn find_meta(id: &str) -> Option<&ShaderMeta> {
    CATALOG.iter().find(|s| s.id == id)
}

pub fn is_upscale_file(filename: &str) -> bool {
    CATALOG
        .iter()
        .any(|s| s.filename == filename && s.category == "upscale")
}
pub fn speed_factor(id: &str) -> Option<f64> {
    find_meta(id).map(|s| s.speed_factor)
}

pub fn is_2x_upscale_id(id: &str) -> bool {
    find_meta(id).is_some_and(|s| s.category == "upscale" && s.filename.contains("_x2"))
}

pub fn build_shader_chain(selected: &[String]) -> Result<Vec<String>, String> {
    let selected_set: HashSet<&str> = selected.iter().map(std::string::String::as_str).collect();

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

    let restore_count = CATALOG
        .iter()
        .filter(|s| s.category == "restore" && selected_set.contains(s.id))
        .count();
    if restore_count > 1 {
        return Err("Можно выбрать только один шейдер восстановления".to_string());
    }

    let mut groups: HashSet<&str> = HashSet::new();
    for id in selected {
        if let Some(meta) = find_meta(id) {
            if let Some(group) = meta.exclusive_group {
                if !groups.insert(group) {
                    return Err(format!(
                        "Нельзя выбрать больше одного шейдера из группы \"{group}\""
                    ));
                }
            }
        }
    }

    let order = ["preprocess", "restore", "upscale", "postprocess"];
    let mut chain: Vec<String> = Vec::new();

    for &cat in &order {
        for meta in CATALOG {
            if meta.category == cat && selected_set.contains(meta.id) && !meta.filename.is_empty() {
                chain.push(meta.filename.to_string());
            }
        }
    }

    Ok(chain)
}

#[tauri::command]
pub fn list_anime4k_shaders() -> Vec<ShaderInfo> {
    list_shaders()
}

#[tauri::command]
pub fn default_anime4k_shaders() -> Vec<String> {
    default_selection()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upscale_file_detection() {
        assert!(is_upscale_file("Anime4K_Upscale_CNN_x2_S.glsl"));
        assert!(is_upscale_file("Anime4K_Upscale_GAN_x4_UUL.glsl"));
        assert!(!is_upscale_file("Anime4K_Restore_CNN_S.glsl"));
        assert!(!is_upscale_file(""));
        assert!(!is_upscale_file("nope.glsl"));
    }
}
