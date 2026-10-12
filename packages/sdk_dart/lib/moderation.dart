/// The moderation protocol's models: the report an app files with the
/// platform, and the decisions the platform delivers back.
///
/// Signing is TypeScript-only (`@devdogsuga/sdk/moderation`): an app's Edge
/// Function signs reports and verifies deliveries, and the Flutter app only
/// needs these shapes (for the report dialog's reasons and for tests).
library;

import 'src/generated/moderation.dart';

export 'src/generated/moderation.dart';

/// Why a member reported something. The values the platform accepts.
typedef ReportReason = ReportRequestReason;
