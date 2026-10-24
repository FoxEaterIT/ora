use keyring::Entry;

const KEYRING_SERVICE: &str = "OraDesktop";
fn session_entry(account: &str) -> Result<Entry, String> {
    validate_keyring_account(account)?;
    Entry::new(KEYRING_SERVICE, account)
        .map_err(|_| "Secure storage is unavailable".to_owned())
}

fn validate_token(token: &str) -> Result<(), String> {
    if token.is_empty()
        || token.len() > 512
        || token.chars().any(char::is_control)
        || !token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err("Invalid session token".into());
    }
    Ok(())
}

#[tauri::command]
fn save_desktop_token(account: String, token: String) -> Result<(), String> {
    validate_token(&token)?;
    validate_keyring_account(&account)?;
    session_entry(&account)?
        .set_password(&token)
        .map_err(|_| "Secure storage is unavailable".to_owned())
}

#[tauri::command]
fn load_desktop_token(account: String) -> Result<Option<String>, String> {
    validate_keyring_account(&account)?;
    let entry = session_entry(&account)?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Secure storage is unavailable".into()),
    }
}

#[tauri::command]
fn delete_desktop_token(account: String) -> Result<(), String> {
    validate_keyring_account(&account)?;
    let entry = session_entry(&account)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Secure storage is unavailable".into()),
    }
}

fn validate_keyring_account(account: &str) -> Result<(), String> {
    if account.len() == 64 && account.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("Invalid account identifier".into())
    }
}

#[cfg(test)]
mod tests {
    use super::{validate_keyring_account, validate_token};

    #[test]
    fn credential_entries_are_scoped_to_a_hashed_server_origin() {
        assert!(validate_keyring_account(&"a".repeat(64)).is_ok());
        assert!(validate_keyring_account("user@example.com").is_err());
        assert!(validate_keyring_account("../session").is_err());
        assert!(validate_keyring_account(&"g".repeat(64)).is_err());
    }

    #[test]
    fn token_validation_accepts_only_opaque_url_safe_tokens() {
        assert!(validate_token("abc-DEF_123.xyz").is_ok());
        assert!(validate_token("").is_err());
        assert!(validate_token("token with spaces").is_err());
        assert!(validate_token("token\\nwith-control").is_err());
        assert!(validate_token(&"a".repeat(513)).is_err());
    }

}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            save_desktop_token,
            load_desktop_token,
            delete_desktop_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ora desktop");
}
