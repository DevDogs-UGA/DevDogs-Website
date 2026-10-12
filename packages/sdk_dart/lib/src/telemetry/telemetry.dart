import 'dart:async';

import 'package:sentry_flutter/sentry_flutter.dart';

import '../generated/constants.dart';
import 'scrub.dart';

/// `tracesSampleRate` for [environment], as the platform sets it: production
/// and staging sample, everything else does not. Errors are always sent.
double tracesSampleRateFor(String environment) {
  switch (environment) {
    case 'production':
      return telemetryTracesSampleRatesProduction;
    case 'staging':
      return telemetryTracesSampleRatesStaging;
    default:
      return 0;
  }
}

/// Scrubs the free text of [event] in place and returns it: the message, each
/// exception's value, and breadcrumb messages.
SentryEvent scrubEvent(SentryEvent event) {
  final message = event.message;
  if (message != null) {
    event.message = SentryMessage(
      scrubText(message.formatted),
      template: message.template,
      params: message.params,
    );
  }
  for (final exception in event.exceptions ?? const <SentryException>[]) {
    final value = exception.value;
    if (value != null) exception.value = scrubText(value);
  }
  for (final crumb in event.breadcrumbs ?? const <Breadcrumb>[]) {
    final text = crumb.message;
    if (text != null) crumb.message = scrubText(text);
  }
  return event;
}

/// Applies the club's Sentry settings to [options]: the DSN, the environment,
/// the sample rates, a `service` tag and the scrubbing `beforeSend`.
///
/// Replay stays off and no screenshots are attached: both can carry a
/// member's data. `sendDefaultPii` stays false.
void configureSentry(
  SentryFlutterOptions options, {
  required String dsn,
  required String environment,
  required String service,
  String? release,
}) {
  options
    ..dsn = dsn
    ..environment = environment
    ..release = release ?? options.release
    ..sendDefaultPii = false
    ..tracesSampleRate = tracesSampleRateFor(environment)
    ..attachScreenshot = false;
  final previous = options.beforeSend;
  options.beforeSend = (event, hint) async {
    final scrubbed = scrubEvent(event);
    return previous == null ? scrubbed : await previous(scrubbed, hint);
  };
  options.beforeBreadcrumb = (crumb, hint) {
    final text = crumb?.message;
    if (crumb != null && text != null) crumb.message = scrubText(text);
    return crumb;
  };
}

/// Starts Sentry for an app, then runs it.
///
/// With an empty [dsn] nothing is initialised and [appRunner] simply runs:
/// a contributor without a DSN gets no network traffic and no errors.
Future<void> initTelemetry({
  required String dsn,
  required String environment,
  required String service,
  required FutureOr<void> Function() appRunner,
  String? release,
}) async {
  if (dsn.isEmpty) {
    await appRunner();
    return;
  }
  await SentryFlutter.init(
    (options) => configureSentry(
      options,
      dsn: dsn,
      environment: environment,
      service: service,
      release: release,
    ),
    appRunner: appRunner,
  );
  Sentry.configureScope((scope) => scope.setTag('service', service));
}
