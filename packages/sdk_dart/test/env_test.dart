import 'package:devdogsuga_sdk/constants.dart';
import 'package:devdogsuga_sdk/env.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('require returns a set value and throws for an empty one', () {
    final env = DevDogsEnv.fromMap({
      'SUPABASE_URL': 'https://dogpack.supabase.co',
      'CATALOG_URL': '',
    });
    expect(env.supabaseUrl, 'https://dogpack.supabase.co');
    expect(() => env.catalogUrl, throwsA(isA<MissingEnvException>()));
  });

  test('requireAll names every missing key at once', () {
    final env = DevDogsEnv.fromMap({'SUPABASE_URL': 'x'});
    expect(
      () => env.requireAll(['SUPABASE_URL', 'CATALOG_URL', 'SENTRY_DSN']),
      throwsA(
        isA<MissingEnvException>().having(
          (e) => e.keys,
          'keys',
          ['CATALOG_URL', 'SENTRY_DSN'],
        ),
      ),
    );
    expect(
      const MissingEnvException(['A']).toString(),
      contains('pnpm devtools setup'),
    );
  });

  test('defaults: no DSN, development environment', () {
    final env = DevDogsEnv.fromMap(const {});
    expect(env.sentryDsn, '');
    expect(env.environment, 'development');
  });

  test('fromDefines reads the compile-time defines (none in a test run)', () {
    final env = DevDogsEnv.fromDefines();
    expect(env[DevDogsEnvKeys.supabaseUrl], isNull);
    expect(env.environment, 'development');
  });

  test('parseDotEnv handles comments, quotes and export', () {
    final values = parseDotEnv('''
# a comment
SUPABASE_URL=https://dogpack.supabase.co
export CATALOG_URL="https://api.devdogsuga.org/catalog/v1"
SENTRY_DSN='https://k@o.ingest.sentry.io/1'

EMPTY=
no equals here
''');
    expect(values, {
      'SUPABASE_URL': 'https://dogpack.supabase.co',
      'CATALOG_URL': 'https://api.devdogsuga.org/catalog/v1',
      'SENTRY_DSN': 'https://k@o.ingest.sentry.io/1',
      'EMPTY': '',
    });
  });

  test('the shared constants match what the SDKs agree on', () {
    expect(hostsApiProduction, 'https://api.devdogsuga.org');
    expect(hostsApiStaging, 'https://api-staging.devdogsuga.org');
    expect(pathsCatalog, '/catalog/v1');
    expect(oauthScopes, ['openid', 'email', 'profile']);
    expect(oauthTiers, ['development', 'production']);
    expect(moderationToleranceSeconds, 300);
  });
}
