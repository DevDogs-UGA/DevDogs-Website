import 'dart:convert';

import 'package:http/http.dart' as http;

/// The API refused the request or could not answer it.
///
/// One type for every failure the DevDogs APIs answer with, so a caller
/// handles a rate limit the same way on the catalog and on the platform.
class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.message,
    this.code,
    this.retryAfterSeconds,
  });

  /// The HTTP status.
  final int statusCode;

  /// The API's `error.code` (`rate_limited`, `invalid_parameter`, ...), or
  /// null when the body was not an API error.
  final String? code;

  final String message;

  /// Seconds from `Retry-After`, set on a 429 or 503.
  final int? retryAfterSeconds;

  @override
  String toString() =>
      'ApiException($statusCode${code == null ? '' : ' $code'}): $message';
}

/// The HTTP runtime the generated clients call. Hand-written: the generated
/// code only knows paths, parameters and models.
class ApiClient {
  ApiClient({
    required String baseUrl,
    http.Client? httpClient,
    this.clientName,
    this.headers = const {},
  })  : baseUrl = baseUrl.replaceAll(RegExp(r'/+$'), ''),
        _http = httpClient ?? http.Client(),
        _ownsClient = httpClient == null;

  /// The API's origin plus its base path, for example
  /// `https://api.devdogsuga.org/catalog/v1`.
  final String baseUrl;

  /// Who is calling (`dogpack/0.3`), sent as `X-Client` for usage numbers only.
  final String? clientName;

  /// Extra headers on every request.
  final Map<String, String> headers;

  final http.Client _http;
  final bool _ownsClient;

  /// Sends a request and returns the decoded JSON body (null when empty).
  /// Throws [ApiException] for a non-2xx answer.
  Future<Object?> send(
    String method,
    String path, {
    Map<String, String> query = const {},
    Object? body,
  }) async {
    final uri = Uri.parse('$baseUrl$path')
        .replace(queryParameters: query.isEmpty ? null : query);
    final request = http.Request(method, uri)
      ..headers['accept'] = 'application/json'
      ..headers.addAll(headers);
    if (clientName != null) request.headers['x-client'] = clientName!;
    if (body != null) {
      request.headers['content-type'] = 'application/json';
      request.body = jsonEncode(body);
    }

    final response = await http.Response.fromStream(await _http.send(request));
    Object? parsed;
    if (response.body.isNotEmpty) {
      try {
        parsed = jsonDecode(response.body);
      } on FormatException {
        parsed = null;
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      String? code;
      var message = 'The API answered ${response.statusCode}';
      if (parsed is Map<String, dynamic> &&
          parsed['error'] is Map<String, dynamic>) {
        final error = parsed['error'] as Map<String, dynamic>;
        if (error['code'] is String) code = error['code'] as String;
        if (error['message'] is String) message = error['message'] as String;
      }
      final retry = int.tryParse(response.headers['retry-after'] ?? '');
      throw ApiException(
        statusCode: response.statusCode,
        code: code,
        message: message,
        retryAfterSeconds: retry != null && retry > 0 ? retry : null,
      );
    }
    return parsed;
  }

  /// Closes the underlying client if this object created it.
  void close() {
    if (_ownsClient) _http.close();
  }
}
