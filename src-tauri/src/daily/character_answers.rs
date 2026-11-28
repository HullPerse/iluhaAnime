use super::{character_pool::Character, characters::AnimeAnswer};

fn folded(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter_map(|c| {
            let mapped = match c {
                'а' => "a",
                'б' => "b",
                'в' => "v",
                'г' => "g",
                'д' => "d",
                'е' | 'ё' | 'э' => "e",
                'ж' => "zh",
                'з' => "z",
                'и' | 'й' => "i",
                'к' => "k",
                'л' => "l",
                'м' => "m",
                'н' => "n",
                'о' => "o",
                'п' => "p",
                'р' => "r",
                'с' => "s",
                'т' => "t",
                'у' => "u",
                'ф' => "f",
                'х' => "h",
                'ц' => "ts",
                'ч' => "ch",
                'ш' | 'щ' => "sh",
                'ы' => "y",
                'ю' => "yu",
                'я' => "ya",
                'ъ' | 'ь' => "",
                _ => return c.is_alphanumeric().then(|| c.to_string()),
            };
            Some(mapped.to_owned())
        })
        .collect::<String>()
        .replace("ou", "o")
        .replace("uu", "u")
        .replace("shi", "si")
        .replace("chi", "ti")
        .replace('j', "dzh")
        .replace("dz", "z")
        .replace("ph", "f")
        .replace("light", "lait")
}

pub(super) fn title_matches(entry: &AnimeAnswer, input: &str) -> bool {
    let input = folded(input);
    !input.is_empty()
        && std::iter::once(&entry.name)
            .chain(entry.aliases.iter())
            .any(|name| folded(name) == input)
}

pub(super) fn character_matches(character: &Character, input: &str) -> bool {
    let entry = AnimeAnswer {
        id: character.id,
        name: character.name.clone(),
        aliases: character.aliases.clone(),
    };
    if title_matches(&entry, input) {
        return true;
    }
    let input = folded(input);
    if input.chars().count() < 3 {
        return false;
    }
    character
        .name
        .split_whitespace()
        .any(|part| folded(part) == input)
        || folded(
            &character
                .name
                .split_whitespace()
                .rev()
                .collect::<Vec<_>>()
                .join(" "),
        ) == input
}
