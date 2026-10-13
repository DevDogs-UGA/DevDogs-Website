/// The keys the SDK understands, as `--dart-define` names.
abstract final class DevDogsEnvKeys {
  static const String supabaseUrl = 'SUPABASE_URL';
  static const String supabasePublishableKey = 'SUPABASE_PUBLISHABLE_KEY';
  static const String catalogUrl = 'CATALOG_URL';
  static const String sentryDsn = 'SENTRY_DSN';
  static const String environment = 'DEVDOGS_ENVIRONMENT';
}

/// A required variable is missing or empty.
class MissingEnvException implements Exception {
  const MissingEnvException(this.keys);

  final List<String> keys;

  @override
  String toString() =>
      'Missing environment: ${keys.join(', ')}. Run `pnpm devtools setup`, then start the app with `flutter run --dart-define-from-file=.env`.';
}

/// The app's public configuration, read from `--dart-define` values.
///
/// Dart can only read a define through a constant name, so [fromDefines] reads
/// the keys in [DevDogsEnvKeys] and nothing else; an app with more keys
/// builds a [DevDogsEnv.fromMap] from its own `String.fromEnvironment` calls.
/// Everything in it is public: a secret in the app's `.env` ships to every
/// phone.
class DevDogsEnv {
  const DevDogsEnv(this._values);

  /// From an explicit map (tests, or an app's own defines).
  factory DevDogsEnv.fromMap(Map<String, String> values) =>
      DevDogsEnv(Map.unmodifiable(values));

  /// From the defines the app was built with.
  factory DevDogsEnv.fromDefines() => const DevDogsEnv({
        DevDogsEnvKeys.supabaseUrl: String.fromEnvironment(
          DevDogsEnvKeys.supabaseUrl,
        ),
        DevDogsEnvKeys.supabasePublishableKey: String.fromEnvironment(
          DevDogsEnvKeys.supabasePublishableKey,
        ),
        DevDogsEnvKeys.catalogUrl: String.fromEnvironment(
          DevDogsEnvKeys.catalogUrl,
        ),
        DevDogsEnvKeys.sentryDsn: String.fromEnvironment(
          DevDogsEnvKeys.sentryDsn,
        ),
        DevDogsEnvKeys.environment: String.fromEnvironment(
          DevDogsEnvKeys.environment,
          defaultValue: 'development',
        ),
      });

  final Map<String, String> _values;

  /// The value, or null when unset or empty.
  String? operator [](String key) {
    final value = _values[key];
    return value == null || value.isEmpty ? null : value;
  }

  /// The value, or [MissingEnvException] when unset or empty.
  String require(String key) {
    final value = this[key];
    if (value == null) throw MissingEnvException([key]);
    return value;
  }

  /// Throws one [MissingEnvException] naming every key in [keys] that is unset.
  void requireAll(Iterable<String> keys) {
    final missing = keys.where((key) => this[key] == null).toList();
    if (missing.isNotEmpty) throw MissingEnvException(missing);
  }

  String get supabaseUrl => require(DevDogsEnvKeys.supabaseUrl);
  String get supabasePublishableKey =>
      require(DevDogsEnvKeys.supabasePublishableKey);
  String get catalogUrl => require(DevDogsEnvKeys.catalogUrl);
  String get sentryDsn => this[DevDogsEnvKeys.sentryDsn] ?? '';
  String get environment =>
      this[DevDogsEnvKeys.environment] ?? 'development';
}

/// Parses the text of a `.env` file: `KEY=value` lines, `#` comments, blank
/// lines, and values that are optionally wrapped in single or double quotes.
Map<String, String> parseDotEnv(String contents) {
  final result = <String, String>{};
  for (final raw in contents.split(RegExp(r'\r?\n'))) {
    final line = raw.trim();
    if (line.isEmpty || line.startsWith('#')) continue;
    final withoutExport =
        line.startsWith('export ') ? line.substring(7).trimLeft() : line;
    final equals = withoutExport.indexOf('=');
    if (equals <= 0) continue;
    final key = withoutExport.substring(0, equals).trim();
    var value = withoutExport.substring(equals + 1).trim();
    if (value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'")))) {
      value = value.substring(1, value.length - 1);
    }
    result[key] = value;
  }
  return result;
}
