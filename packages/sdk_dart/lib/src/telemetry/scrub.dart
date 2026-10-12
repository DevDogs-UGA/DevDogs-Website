import '../generated/scrub_rules.dart';

/// Expands a JavaScript replacement string (`$1`, `$$`) against [match].
String _expand(String replacement, Match match) {
  return replacement.replaceAllMapped(RegExp(r'\$(\$|\d)'), (token) {
    final symbol = token.group(1)!;
    if (symbol == r'$') return r'$';
    final index = int.parse(symbol);
    return index <= match.groupCount ? (match.group(index) ?? '') : '';
  });
}

final List<(RegExp, String)> _compiled = [
  for (final rule in scrubRules) (RegExp(rule.pattern), rule.replacement),
];

/// Removes what must not leave the device from a piece of free text: absolute
/// file paths (reduced to their basename), email addresses, `KEY=value`
/// secrets and bearer tokens.
///
/// The rules are the TypeScript SDK's (`scrubText` in
/// `@devdogsuga/sdk/telemetry`), generated from the one table, so an event
/// from the app and one from the platform are scrubbed the same way.
String scrubText(String text) {
  var result = text;
  for (final (pattern, replacement) in _compiled) {
    result = result.replaceAllMapped(
      pattern,
      (match) => _expand(replacement, match),
    );
  }
  return result;
}
