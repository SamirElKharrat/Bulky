/// Webs de las que la app puede descargar datos. Cualquier otra dirección se rechaza.
const ALLOWED: &[&str] = &[
    "https://downloads.s3.cardmarket.com/productCatalog/",
    "https://riftbound.leagueoflegends.com/",
    "https://playriftbound.com/",
    "https://api.github.com/repos/",
];

fn download(url: String) -> Result<String, String> {
    if !ALLOWED.iter().any(|p| url.starts_with(p)) {
        return Err("dirección no permitida".into());
    }
    let res = ureq::get(&url)
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Bulky/0.1")
        .call()
        .map_err(|e| e.to_string())?;
    res.into_string().map_err(|e| e.to_string())
}

/// Descarga los archivos públicos de Cardmarket (price guide y lista de productos de Riftbound).
/// Se hace desde Rust porque el navegador de la app no puede pedirlos directamente (CORS).
#[tauri::command]
async fn fetch_cardmarket(kind: String) -> Result<String, String> {
    let url = match kind.as_str() {
        "products" => "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_22.json",
        "prices" => "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_22.json",
        _ => return Err("tipo de archivo desconocido".into()),
    };
    let url = url.to_string();
    tauri::async_runtime::spawn_blocking(move || download(url)).await.map_err(|e| e.to_string())?
}

/// Descarga una página o feed de noticias de las webs permitidas.
#[tauri::command]
async fn fetch_url(url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || download(url)).await.map_err(|e| e.to_string())?
}

/// Abre un enlace https en el navegador del sistema.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") || url.chars().any(|c| c.is_whitespace() || c == '"') {
        return Err("enlace no válido".into());
    }
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", &url]).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(&url).spawn();
    r.map(|_| ()).map_err(|e| e.to_string())
}

/// Abre el diálogo "Guardar como" de Windows y guarda el texto donde elija el usuario.
/// Devuelve la ruta elegida, o nada si cancela.
#[tauri::command]
async fn save_file(app: tauri::AppHandle, name: String, content: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app
        .dialog()
        .file()
        .set_title("Guardar copia de seguridad")
        .set_file_name(&name)
        .add_filter("Copia de Bulky", &["json"])
        .blocking_save_file();
    let Some(file) = picked else { return Ok(None) };
    let path = file.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![fetch_cardmarket, fetch_url, open_url, save_file])
        .run(tauri::generate_context!())
        .expect("error al arrancar Bulky");
}
