import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

/** The Android app shows the live web system, so updates on Vercel appear here automatically. */
const SITE = 'https://mandera-surveillance.vercel.app';
const BRAND = '#174a45';

function Shell() {
  const web = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  // Android back button navigates inside the site instead of closing the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        web.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const onNav = useCallback((nav: WebViewNavigation) => setCanGoBack(nav.canGoBack), []);

  const retry = () => {
    setOffline(false);
    setLoading(true);
    web.current?.reload();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      {offline ? (
        <View style={styles.center}>
          <Text style={styles.title}>No internet connection</Text>
          <Text style={styles.body}>Check your connection and try again.</Text>
          <Pressable style={styles.button} onPress={retry} accessibilityRole="button">
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          ref={web}
          source={{ uri: SITE }}
          style={styles.web}
          onNavigationStateChange={onNav}
          onLoadEnd={() => setLoading(false)}
          onError={() => setOffline(true)}
          onHttpError={(e) => e.nativeEvent.statusCode >= 500 && setOffline(true)}
          // Phone, email and external links open in the right app.
          onShouldStartLoadWithRequest={(req) => {
            if (req.url.startsWith(SITE) || req.url.startsWith('about:')) return true;
            Linking.openURL(req.url).catch(() => undefined);
            return false;
          }}
          domStorageEnabled
          javaScriptEnabled
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
        />
      )}
      {loading && !offline && (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND },
  web: { flex: 1, backgroundColor: '#f8fafc' },
  loader: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f8fafc' },
  title: { fontSize: 20, fontWeight: '600', color: '#0f1d1c' },
  body: { marginTop: 8, fontSize: 15, color: '#475553', textAlign: 'center' },
  button: { marginTop: 24, backgroundColor: '#236961', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
