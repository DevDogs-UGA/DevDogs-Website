import 'package:supabase_flutter/supabase_flutter.dart';

import '../generated/constants.dart';

/// Launches the OAuth flow for [provider]. Matches `signInWithOAuth` from
/// `supabase_flutter`, so a test can stand in for the browser.
typedef OAuthLauncher = Future<bool> Function(
  OAuthProvider provider, {
  String? redirectTo,
  String? scopes,
});

/// "Sign in with DevDogs": the club's OIDC provider, registered on each
/// product's Supabase project as `custom:devdogsuga` (`devtools oauth` does it
/// for a contributor's own project; the deploy does it for production).
///
/// ```dart
/// final auth = DevDogsAuth(Supabase.instance.client.auth);
/// await auth.signIn(redirectTo: 'dev.dogpack://login-callback');
/// ```
///
/// The result is not the session: the browser flow ends in a deep link that
/// `supabase_flutter` completes, and the session arrives on
/// `onAuthStateChange`.
class DevDogsAuth {
  /// Uses [auth] to start the flow in an external browser.
  DevDogsAuth(GoTrueClient auth)
      : _launch = ((provider, {redirectTo, scopes}) => auth.signInWithOAuth(
              provider,
              redirectTo: redirectTo,
              scopes: scopes,
            )),
        _auth = auth;

  /// For tests: [launch] replaces the browser.
  DevDogsAuth.withLauncher(OAuthLauncher launch)
      : _launch = launch,
        _auth = null;

  final OAuthLauncher _launch;
  final GoTrueClient? _auth;

  /// The provider id the products register: `custom:devdogsuga`.
  static const OAuthProvider provider = OAuthProvider(oauthProviderId);

  /// The scopes asked for, space-separated as OAuth wants them.
  static String get scopes => oauthScopes.join(' ');

  /// Opens the DevDogs sign-in page. Returns whether the browser launched.
  Future<bool> signIn({required String redirectTo}) =>
      _launch(provider, redirectTo: redirectTo, scopes: scopes);

  /// Ends the session on this device.
  Future<void> signOut() {
    final auth = _auth;
    if (auth == null) {
      throw StateError('This DevDogsAuth was built for tests and has no client.');
    }
    return auth.signOut();
  }

  /// The member's platform user id: the `sub` of their DevDogs identity.
  ///
  /// This is the id the moderation API takes as `reporterUserId` and
  /// `authorUserId`. Null for a user who has not signed in with DevDogs.
  static String? platformUserId(User user) {
    for (final identity in user.identities ?? const <UserIdentity>[]) {
      if (identity.provider != oauthProviderId) continue;
      final sub = identity.identityData?['sub'];
      return sub is String ? sub : identity.id;
    }
    return null;
  }

  /// Where the OIDC discovery document lives for a Supabase project at
  /// [supabaseUrl]. The issuer inside it is what the provider is registered
  /// with; read it from here instead of writing it down.
  static Uri discoveryUri(String supabaseUrl) {
    final base = supabaseUrl.replaceAll(RegExp(r'/+$'), '');
    return Uri.parse('$base$oauthDiscoveryPath');
  }
}
