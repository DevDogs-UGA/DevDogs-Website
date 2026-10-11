import 'dart:convert';

import 'package:devdogsuga_sdk/catalog.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _partOfTerm = {
  'code': '1',
  'description': 'Full Term',
  'classesBegin': '2027-01-11',
  'dropAddEnds': '2027-01-15',
  'censusDate': '2027-01-29',
  'withdrawalDeadline': '2027-03-12',
  'classesEnd': '2027-04-27',
  'finalsEnd': null,
};

const _term = {
  'academicPeriod': 202702,
  'description': 'Spring 2027',
  'classesBegin': '2027-01-11',
  'classesEnd': '2027-05-04',
  'dropAddEnds': '2027-01-15',
  'partsOfTerm': [_partOfTerm],
};

const _summary = {
  'courseId': 101,
  'abbr': 'CSCI1301',
  'courseNumber': '1301',
  'title': 'Software Development',
  'subject': 'CSCI',
  'minCreditHours': 4,
  'maxCreditHours': 4.0,
  'honors': false,
  'sectionCount': 12,
};

const _section = {
  'crn': 12345,
  'courseId': 101,
  'courseAbbr': 'CSCI1301',
  'courseNumber': '1301',
  'courseTitle': 'Software Development',
  'creditHours': {'min': 4, 'max': 4},
  'campus': {'id': 1, 'abbr': 'ATH', 'description': 'Athens'},
  'professor': {'name': 'Ada Lovelace'},
  'seatsAvailable': 3,
  'actualEnrollment': 27,
  'maximumEnrollment': 30,
  'cancelled': false,
  'lastSeenAt': '2026-10-10T14:07:00.000Z',
  'academicPeriod': 202702,
  'dateRange': {'start': '2027-01-11', 'end': '2027-04-27'},
  'meetings': [
    {
      'days': ['monday', 'wednesday'],
      'startDate': '2027-01-11',
      'endDate': '2027-04-27',
      'startTime': '09:00:00',
      'endTime': '09:50:00',
      'building': {
        'code': '24',
        'description': 'Meigs Hall',
        'address': null,
        'lat': 33.9,
        'lon': -83.37,
      },
      'room': '101',
      'locationStatus': 'RESERVED',
    },
    {
      'days': <String>[],
      'startDate': null,
      'endDate': null,
      'startTime': null,
      'endTime': null,
      'building': null,
      'room': null,
      'locationStatus': 'TBA',
    },
  ],
};

class _Seen {
  http.BaseRequest? request;
}

CatalogClient _client(
  _Seen seen,
  Object body, {
  int status = 200,
  Map<String, String> headers = const {},
  String? clientName = 'dogpack/0.1',
}) {
  return CatalogClient(
    baseUrl: 'https://api-staging.devdogsuga.org/catalog/v1/',
    clientName: clientName,
    httpClient: MockClient((request) async {
      seen.request = request;
      return http.Response(
        jsonEncode(body),
        status,
        headers: {'content-type': 'application/json', ...headers},
      );
    }),
  );
}

void main() {
  test('listTerms sends X-Client and parses terms, with a trailing slash base',
      () async {
    final seen = _Seen();
    final terms = await _client(seen, {
      'terms': [_term],
    }).listTerms();

    expect(
      seen.request!.url.toString(),
      'https://api-staging.devdogsuga.org/catalog/v1/terms',
    );
    expect(seen.request!.headers['x-client'], 'dogpack/0.1');
    expect(terms.terms.single.academicPeriod, 202702);
    expect(terms.terms.single.dropAddEnds, '2027-01-15');
    expect(terms.terms.single.partsOfTerm.single.finalsEnd, isNull);
  });

  test('listSubjects leaves out an absent term and sends a given one',
      () async {
    final seen = _Seen();
    final body = {
      'term': 202702,
      'subjects': [
        {'abbr': 'CSCI', 'description': 'Computer Science', 'courseCount': 40},
      ],
    };
    await _client(seen, body).listSubjects();
    expect(seen.request!.url.query, isEmpty);

    final list = await _client(seen, body).listSubjects(term: 202702);
    expect(seen.request!.url.queryParameters, {'term': '202702'});
    expect(list.subjects.single.courseCount, 40);
  });

  test('listSubjectCourses puts the subject in the path, encoded', () async {
    final seen = _Seen();
    final result = await _client(seen, {
      'term': 202702,
      'subject': {'abbr': 'CSCI', 'description': 'Computer Science'},
      'courses': [_summary],
    }).listSubjectCourses(abbr: 'CS CI', term: 202702);

    expect(seen.request!.url.path, '/catalog/v1/subjects/CS%20CI/courses');
    expect(result.courses.single.maxCreditHours, 4.0);
    expect(result.courses.single.minCreditHours, 4.0);
  });

  test('searchCourses sends the query and the optional limit', () async {
    final seen = _Seen();
    final result = await _client(seen, {
      'term': 202702,
      'query': 'intro to programming',
      'limit': 10,
      'results': [_summary],
    }).searchCourses(term: 202702, q: 'intro to programming', limit: 10);

    expect(seen.request!.url.queryParameters, {
      'term': '202702',
      'q': 'intro to programming',
      'limit': '10',
    });
    expect(result.results.single.abbr, 'CSCI1301');
  });

  test('getCourse parses details and an unknown prerequisites value',
      () async {
    final seen = _Seen();
    final detail = await _client(seen, {
      'course': {
        'courseId': 101,
        'abbr': 'CSCI1301',
        'courseNumber': '1301',
        'title': 'Software Development',
        'abbrTitle': 'Software Dev',
        'subject': {'abbr': 'CSCI', 'description': 'Computer Science'},
        'college': 'Franklin',
        'department': null,
        'minCreditHours': 4,
        'maxCreditHours': 4,
        'minBillingCreditHours': 4,
        'honors': false,
      },
      'details': {
        'description': 'Intro.',
        'gradingSystem': null,
        'semesterOffered': null,
        'corequisite': null,
        'equivalentCourses': null,
        'prerequisites': {
          'all': ['MATH1113'],
        },
        'lastFetched': '2026-10-01T12:00:00Z',
      },
      'offeredIn': [202702, 202608],
      'sectionCount': null,
    }).getCourse(abbr: 'CSCI1301');

    expect(detail.offeredIn, [202702, 202608]);
    expect(detail.details!.prerequisites, isA<Map>());
    expect(detail.details!.lastFetched, DateTime.utc(2026, 10, 1, 12));
    expect(detail.course.department, isNull);
    expect(detail.toJson()['details'], isNotNull);
  });

  test('courseExists is a plain query', () async {
    final seen = _Seen();
    final result = await _client(seen, {
      'abbr': 'CSCI1301',
      'term': 202702,
      'exists': true,
      'offered': true,
    }).courseExists(abbr: 'csci 1301', term: 202702);

    expect(seen.request!.url.path, '/catalog/v1/course-exists');
    expect(seen.request!.url.queryParameters['abbr'], 'csci 1301');
    expect(result.exists, isTrue);
    expect(result.offered, isTrue);
  });

  test('listSections parses meetings, enums and nullable locations', () async {
    final seen = _Seen();
    final result = await _client(seen, {
      'term': 202702,
      'sections': [_section],
    }).listSections(term: 202702, courses: 'CSCI1301,MATH2250');

    expect(seen.request!.url.queryParameters, {
      'term': '202702',
      'courses': 'CSCI1301,MATH2250',
    });
    final section = result.sections.single;
    expect(section.crn, 12345);
    expect(section.professor!.name, 'Ada Lovelace');
    expect(section.lastSeenAt, DateTime.utc(2026, 10, 10, 14, 7));
    expect(section.dateRange!.end, '2027-04-27');
    final meetings = section.meetings;
    expect(meetings[0].days, [MeetingDaysItem.monday, MeetingDaysItem.wednesday]);
    expect(meetings[0].locationStatus, MeetingLocationStatus.reserved);
    expect(meetings[0].building!.lat, 33.9);
    expect(meetings[1].locationStatus, MeetingLocationStatus.tba);
    expect(meetings[1].building, isNull);
  });

  test('toJson round-trips what fromJson read', () {
    final section = Section.fromJson(_section);
    final again = Section.fromJson(
      jsonDecode(jsonEncode(section.toJson())) as Map<String, dynamic>,
    );
    expect(jsonEncode(again.toJson()), jsonEncode(section.toJson()));
    expect(section.toJson()['creditHours'], {'min': 4.0, 'max': 4.0});
  });

  test('a 429 becomes an ApiException with the code and Retry-After',
      () async {
    final seen = _Seen();
    final client = _client(
      seen,
      {
        'error': {'code': 'rate_limited', 'message': 'Slow down'},
      },
      status: 429,
      headers: {'retry-after': '12'},
    );
    await expectLater(
      client.listTerms(),
      throwsA(
        isA<ApiException>()
            .having((e) => e.statusCode, 'statusCode', 429)
            .having((e) => e.code, 'code', 'rate_limited')
            .having((e) => e.message, 'message', 'Slow down')
            .having((e) => e.retryAfterSeconds, 'retryAfterSeconds', 12),
      ),
    );
  });

  test('a non-JSON failure still throws an ApiException', () async {
    final client = CatalogClient(
      baseUrl: 'https://example.test/catalog/v1',
      httpClient: MockClient((_) async => http.Response('<html>', 502)),
    );
    await expectLater(
      client.listTerms(),
      throwsA(
        isA<ApiException>()
            .having((e) => e.statusCode, 'statusCode', 502)
            .having((e) => e.code, 'code', isNull),
      ),
    );
  });

  test('the servers table lists production and staging', () {
    expect(catalogServers.keys, containsAll(['production', 'staging']));
    expect(catalogServers['staging'], contains('api-staging.devdogsuga.org'));
  });
}
