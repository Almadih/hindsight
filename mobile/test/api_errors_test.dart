import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hindsight/api.dart';

void main() {
  test('friendlyError turns raw failures into sentences', () {
    expect(friendlyError(const SocketException('x')), contains('internet connection'));
    expect(friendlyError(TimeoutException('x')), contains('too long'));
    expect(friendlyError(ApiError('player not found', 404)), 'Player not found.');
    expect(friendlyError(ApiError('', 429)), contains('Try again in a minute'));
    expect(friendlyError(ApiError('boom', 503)), contains('server had a problem'));
  });
}
