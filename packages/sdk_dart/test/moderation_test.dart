import 'dart:convert';

import 'package:devdogsuga_sdk/moderation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const reporter = '00000000-0000-4000-8000-0000000000b1';
  const author = '00000000-0000-4000-8000-0000000000b2';

  test('a report round-trips, with its reason as an enum', () {
    final json = {
      'reporterUserId': reporter,
      'authorUserId': author,
      'contentType': 'session',
      'contentRef': 'abc',
      'contentSnapshot': 'Study group, 9pm',
      'contentUrl': null,
      'reason': 'hate_speech',
    };
    final report = ReportRequest.fromJson(json);
    expect(report.reason, ReportReason.hateSpeech);
    expect(report.reason.value, 'hate_speech');
    expect(report.description, isNull);
    final out = report.toJson();
    expect(out['reason'], 'hate_speech');
    // `description` and `contentUrl` are optional, so a null one is left out.
    expect(out.containsKey('description'), isFalse);
    expect(out.containsKey('contentUrl'), isFalse);
  });

  test('every reason the platform accepts has a Dart value', () {
    expect(
      ReportReason.values.map((r) => r.value),
      containsAll([
        'harassment',
        'hate_speech',
        'spam',
        'sexual_content',
        'violence',
        'impersonation',
        'off_topic',
        'other',
      ]),
    );
  });

  test('a content message decodes to ContentMessage and keeps its type', () {
    final message = ModerationMessage.fromJson({
      'type': 'content.hide',
      'timestamp': '2027-01-01T00:00:00.000Z',
      'data': {
        'contentType': 'session',
        'contentRef': 'abc',
        'reportId': null,
      },
    });
    expect(message, isA<ContentMessage>());
    final content = message as ContentMessage;
    expect(content.type, ContentMessageType.contentHide);
    expect(content.data.contentRef, 'abc');
    expect(jsonEncode(content.toJson()), contains('"content.hide"'));
  });

  test('a user message decodes to UserMessage', () {
    final message = ModerationMessage.fromJson({
      'type': 'user.ban',
      'timestamp': '2027-01-01T00:00:00.000Z',
      'data': {'userId': author, 'reason': 'harassment', 'reportId': null},
    });
    expect(message, isA<UserMessage>());
    expect((message as UserMessage).data.userId, author);
  });

  test('an unknown message type is refused, not guessed at', () {
    expect(
      () => ModerationMessage.fromJson({
        'type': 'content.explode',
        'timestamp': '2027-01-01T00:00:00.000Z',
        'data': <String, dynamic>{},
      }),
      throwsFormatException,
    );
  });

  test('the error body decodes its code', () {
    final error = ReportError.fromJson({
      'error': {'code': 'bad_signature', 'message': 'no'},
    });
    expect(error.error.code, ReportErrorErrorCode.badSignature);
  });
}
