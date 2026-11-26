// Evita que se abra una consola extra en Windows en la versión final.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    bulksort_lib::run()
}
