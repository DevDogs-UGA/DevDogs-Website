import 'package:devdogsuga_sdk/auth.dart';
import 'package:devdogsuga_sdk/constants.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _MemoryStorage extends GotrueAsyncStorage {
  final Map<String, String> _items = {};

  @override
  Future<String?> getItem({required String key}) async => _items[key];

  @override
  Future<void> removeItem({required String key}) async => _items.remove(key);

  @override
  Future<void> setItem({required String key, required String value}) async =>
      _items[key] = value;
}

User _user(List<UserIdentity> identities) => User(
      id: 'local-user',
      appMetadata: const {},
      userMetadata: const {},
      aud: 'authenticated',
      createdAt: '2026-10-11T00:00:00Z',
      identities: identities,
    );

void main() {
  test('the provider id is custom:devdogsuga, and supabase_flutter takes it',
      () {
    expect(DevDogsAuth.provider.name, 'custom:devdogsuga');
    expect(oauthProviderId, 'custom:devdogsuga');

    // The real client builds the authorize URL for a custom provider id.
    final auth = GoTrueClient(
      url: 'http://127.0.0.1:54321/auth/v1',
      asyncStorage: _MemoryStorage(),
    );
    final response = auth.getOAuthSignInUrl(
      provider: DevDogsAuth.provider,
      redirectTo: 'dev.dogpack://login-callback',
      scopes: DevDogsAuth.scopes,
    );
    return response.then((r) {
      final url = Uri.parse(r.url);
      expect(url.queryParameters['provider'], 'custom:devdogsuga');
      expect(url.queryParameters['scopes'], 'openid email profile');
      expect(url.queryParameters['redirect_to'], 'dev.dogpack://login-callback');
    });
  });

  test('signIn hands the provider, redirect and scopes to the launcher',
      () async {
    OAuthProvider? seenProvider;
    String? seenRedirect;
    String? seenScopes;
    final auth = DevDogsAuth.withLauncher((
      provider, {
      redirectTo,
      scopes,
    }) async {
      seenProvider = provider;
      seenRedirect = redirectTo;
      seenScopes = scopes;
      return true;
    });

    expect(await auth.signIn(redirectTo: 'dev.dogpack://login-callback'), isTrue);
    expect(seenProvider!.name, 'custom:devdogsuga');
    expect(seenRedirect, 'dev.dogpack://login-callback');
    expect(seenScopes, 'openid email profile');
  });

  test('signOut needs a real client', () {
    final auth = DevDogsAuth.withLauncher((p, {redirectTo, scopes}) async => true);
    expect(auth.signOut, throwsStateError);
  });

  test('the platform user id is the sub of the DevDogs identity', () {
    final user = _user([
      const UserIdentity(
        id: 'google-id',
        userId: 'local-user',
        identityData: {'sub': 'google-sub'},
        identityId: 'i1',
        provider: 'google',
        createdAt: null,
        lastSignInAt: null,
      ),
      const UserIdentity(
        id: 'fallback-id',
        userId: 'local-user',
        identityData: {'sub': 'platform-user-id'},
        identityId: 'i2',
        provider: 'custom:devdogsuga',
        createdAt: null,
        lastSignInAt: null,
      ),
    ]);
    expect(DevDogsAuth.platformUserId(user), 'platform-user-id');
  });

  test('a user with no DevDogs identity has no platform user id', () {
    expect(DevDogsAuth.platformUserId(_user(const [])), isNull);
  });

  test('the discovery document is under the project origin', () {
    expect(
      DevDogsAuth.discoveryUri('https://dogpack.supabase.co/').toString(),
      'https://dogpack.supabase.co/auth/v1/.well-known/openid-configuration',
    );
  });
}
