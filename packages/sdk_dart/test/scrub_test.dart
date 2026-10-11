import 'dart:convert';
import 'dart:io';

import 'package:devdogsuga_sdk/telemetry.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

void main() {
  final cases = (jsonDecode(
    File('../sdk-spec/telemetry/scrub-cases.json').readAsStringSync(),
  ) as Map<String, dynamic>)['cases'] as List<dynamic>;

  group('shared scrub cases (the same list the TypeScript SDK runs)', () {
    for (final raw in cases) {
      final c = raw as Map<String, dynamic>;
      test(c['name'] as String, () {
        expect(scrubText(c['input'] as String), c['expected'] as String);
      });
    }
  });

  test('scrubEvent cleans the message, exceptions and breadcrumbs', () {
    final event = SentryEvent(
      message: SentryMessage('failed for hello@uga.edu'),
      exceptions: [
        SentryException(
          type: 'StateError',
          value: 'bad state at /home/sloan/app/lib/main.dart',
        ),
      ],
      breadcrumbs: [Breadcrumb(message: 'token=abc API_KEY=zzz')],
    );
    final scrubbed = scrubEvent(event);
    expect(scrubbed.message!.formatted, 'failed for [redacted-email]');
    expect(scrubbed.exceptions!.single.value, 'bad state at main.dart');
    expect(scrubbed.breadcrumbs!.single.message, 'token=abc API_KEY=[redacted]');
  });

  test('sample rates follow the platform: production and staging only', () {
    expect(tracesSampleRateFor('production'), 0.2);
    expect(tracesSampleRateFor('staging'), 0.05);
    expect(tracesSampleRateFor('development'), 0);
  });

  test('configureSentry sets the options and chains an existing beforeSend',
      () async {
    final options = SentryFlutterOptions();
    var chained = false;
    options.beforeSend = (event, hint) {
      chained = true;
      return event;
    };
    configureSentry(
      options,
      dsn: 'https://key@o0.ingest.sentry.io/1',
      environment: 'staging',
      service: 'dogpack',
    );
    expect(options.environment, 'staging');
    expect(options.sendDefaultPii, isFalse);
    expect(options.tracesSampleRate, 0.05);
    expect(options.attachScreenshot, isFalse);

    final event = SentryEvent(message: SentryMessage('mail hello@uga.edu'));
    final result = await options.beforeSend!(event, Hint());
    expect(result!.message!.formatted, 'mail [redacted-email]');
    expect(chained, isTrue);
  });

  test('initTelemetry with no DSN just runs the app', () async {
    var ran = false;
    await initTelemetry(
      dsn: '',
      environment: 'development',
      service: 'dogpack',
      appRunner: () => ran = true,
    );
    expect(ran, isTrue);
  });
}
