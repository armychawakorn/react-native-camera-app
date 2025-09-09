import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MaterialIcons } from "@expo/vector-icons";

type StackParamList = {
  Camera: undefined;
  Gallery: undefined;
  Viewer: { assetId?: string; uri?: string };
};

const Stack = createNativeStackNavigator<StackParamList>();
const ALBUM_NAME = "Camera App";

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Camera" component={CameraScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Gallery" component={GalleryScreen} options={{ title: "แกลเลอรี" }} />
        <Stack.Screen
          name="Viewer"
          component={ViewerScreen}
          options={{ headerStyle: { backgroundColor: "#000" }, headerTintColor: "#fff", title: "รูปภาพ" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function CameraScreen({ navigation }: any) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaStatus, setMediaStatus] = useState<MediaLibrary.PermissionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [torch, setTorch] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(0);
  const cameraRef = useRef<CameraView | null>(null);
  const [latestUri, setLatestUri] = useState<string | null>(null);
  const [zoomTrackWidth, setZoomTrackWidth] = useState<number>(0);
  const pinchRef = useRef<{ startDist: number; startZoom: number; active: boolean }>({
    startDist: 0,
    startZoom: 0,
    active: false,
  });

  const MIN_X = 1;
  const MAX_X = 3; // iOS-style steps 1x/2x/3x
  const zoomXValue = MIN_X + zoom * (MAX_X - MIN_X);
  const zoomX = zoomXValue.toFixed(1);
  const zoomOptions = [1, 2, 3];
  const setZoomFromMultiplier = (x: number) => {
    const clampedX = Math.max(MIN_X, Math.min(MAX_X, x));
    const z = (clampedX - MIN_X) / (MAX_X - MIN_X);
    setZoom(+z.toFixed(3));
  };

  useEffect(() => {
    (async () => {
      const media = await MediaLibrary.requestPermissionsAsync();
      setMediaStatus(media.status);
      if (!cameraPermission) await requestCameraPermission();
    })();
  }, []);

  useEffect(() => {
    // load latest photo for preview button
    if (mediaStatus === "granted") refreshLatest();
  }, [mediaStatus]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      if (mediaStatus === "granted") refreshLatest();
    });
    return unsub;
  }, [navigation, mediaStatus]);

  const resolveAssetIdToUri = async (assetId: string): Promise<string | null> => {
    try {
      const info = await (MediaLibrary.getAssetInfoAsync as any)(assetId, { shouldDownloadFromNetwork: true });
      const next = info?.localUri || info?.uri;
      if (typeof next === "string" && !next.startsWith("ph://")) return next;
      return null;
    } catch {
      return null;
    }
  };

  const refreshLatest = async () => {
    try {
      const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
      let res = await MediaLibrary.getAssetsAsync({
        first: 1,
        mediaType: [MediaLibrary.MediaType.photo],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]] as any,
        album: album?.id,
      } as any);
      if (!res.assets?.length) {
        res = await MediaLibrary.getAssetsAsync({
          first: 1,
          mediaType: [MediaLibrary.MediaType.photo],
          sortBy: [[MediaLibrary.SortBy.creationTime, false]] as any,
        } as any);
      }
      const first = res.assets?.[0];
      if (first) {
        if (first.uri.startsWith("ph://")) {
          setLatestUri(await resolveAssetIdToUri(first.id));
        } else {
          setLatestUri(first.uri);
        }
      } else {
        setLatestUri(null);
      }
    } catch {
      setLatestUri(null);
    }
  };

  if (!cameraPermission || mediaStatus == null) {
    return (
      <SafeAreaView style={styles.center}>
        <Text>กำลังขอสิทธิ์การใช้งาน...</Text>
      </SafeAreaView>
    );
  }

  if (!cameraPermission.granted || mediaStatus !== "granted") {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>ต้องการสิทธิ์กล้องและคลังภาพ</Text>
        <Pressable
          style={styles.button}
          onPress={() => {
            requestCameraPermission();
            MediaLibrary.requestPermissionsAsync().then((m) => setMediaStatus(m.status));
          }}
        >
          <Text style={styles.buttonText}>อนุญาต</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const ensureAlbum = async (
    firstAsset?: MediaLibrary.Asset
  ): Promise<MediaLibrary.Album | null> => {
    try {
      const existing = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
      if (existing) return existing;
      if (firstAsset) return await MediaLibrary.createAlbumAsync(ALBUM_NAME, firstAsset, false);
      return null;
    } catch {
      return null;
    }
  };

  const takePhoto = async () => {
    try {
      if (!cameraRef.current) return;
      setLoading(true);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: true });
      if (!photo?.uri) throw new Error("No photo URI");

      const asset = await MediaLibrary.createAssetAsync(photo.uri);
      const album = await ensureAlbum(asset);
      if (album) {
        try {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album.id, false);
        } catch {}
      }
      // no success alert; keep UX silent
      // update latest preview to the newly captured photo
      try {
        const next = await resolveAssetIdToUri(asset.id);
        setLatestUri(next ?? asset.uri);
      } catch {}
    } catch (e: any) {
      Alert.alert("เกิดข้อผิดพลาด", e?.message ?? "ไม่สามารถถ่ายภาพได้");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.cameraRoot}>
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing} enableTorch={torch} zoom={zoom} />
        {/* Pinch-to-zoom gesture layer (captures only multi-touch) */}
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={(e) => e.nativeEvent.touches.length >= 2}
          onMoveShouldSetResponder={(e) => e.nativeEvent.touches.length >= 2}
          onResponderGrant={(e) => {
            const t = e.nativeEvent.touches;
            if (t.length < 2) return;
            const dx = t[0].pageX - t[1].pageX;
            const dy = t[0].pageY - t[1].pageY;
            const dist = Math.hypot(dx, dy);
            pinchRef.current = { startDist: dist || 1, startZoom: zoom, active: true };
          }}
          onResponderMove={(e) => {
            if (!pinchRef.current.active) return;
            const t = e.nativeEvent.touches;
            if (t.length < 2) return;
            const dx = t[0].pageX - t[1].pageX;
            const dy = t[0].pageY - t[1].pageY;
            const dist = Math.hypot(dx, dy) || 1;
            const scale = dist / (pinchRef.current.startDist || 1);
            // map scale delta to normalized zoom in 1..3x range
            const delta = (scale - 1) * 0.9; // sensitivity
            const next = Math.max(0, Math.min(1, pinchRef.current.startZoom + delta));
            setZoom(+next.toFixed(3));
          }}
          onResponderRelease={() => {
            pinchRef.current.active = false;
          }}
          onResponderTerminationRequest={() => true}
          onResponderTerminate={() => {
            pinchRef.current.active = false;
          }}
        />
        {/* Zoom HUD */}
        <View style={styles.zoomHud} pointerEvents="none">
          <Text style={styles.zoomHudText}>{zoomX}x</Text>
        </View>
        <View style={styles.cameraTopBar}>
          <Pressable
            style={styles.flashButton}
            onPress={() => setTorch((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="สลับแฟลช"
          >
            <MaterialIcons name={torch ? "flash-on" : "flash-off"} size={22} color="#111827" />
          </Pressable>
        </View>
        <View style={styles.controls}>
          <Pressable style={styles.shutter} onPress={takePhoto} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <View style={styles.shutterInner} />}
          </Pressable>
          <Pressable
            style={styles.flipIcon}
            onPress={() => setFacing((p) => (p === "back" ? "front" : "back"))}
            accessibilityRole="button"
            accessibilityLabel="สลับกล้องหน้า-หลัง"
            hitSlop={10}
          >
            <MaterialIcons name="flip-camera-ios" size={28} color="#111827" />
          </Pressable>
          <Pressable
            style={styles.galleryButton}
            onPress={() => navigation.navigate("Gallery")}
            accessibilityRole="button"
            accessibilityLabel="เปิดแกลเลอรี"
            hitSlop={10}
          >
            {latestUri ? (
              <Image source={{ uri: latestUri }} style={styles.galleryThumb} />
            ) : (
              <View style={[styles.galleryThumb, { backgroundColor: "#e5e7eb" }]} />)
            }
          </Pressable>
          {/* iOS-style zoom chips with drag */}
          <View
            style={styles.zoomChips}
            onLayout={(e) => setZoomTrackWidth(e.nativeEvent.layout.width)}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => {
              if (!zoomTrackWidth) return;
              const x = Math.max(0, Math.min(zoomTrackWidth, e.nativeEvent.locationX));
              const ratio = x / zoomTrackWidth;
              const m = MIN_X + ratio * (MAX_X - MIN_X); // 1x..3x range
              setZoomFromMultiplier(m);
            }}
            onResponderMove={(e) => {
              if (!zoomTrackWidth) return;
              const x = Math.max(0, Math.min(zoomTrackWidth, e.nativeEvent.locationX));
              const ratio = x / zoomTrackWidth;
              const m = MIN_X + ratio * (MAX_X - MIN_X);
              setZoomFromMultiplier(m);
            }}
          >
            {zoomOptions.map((opt) => {
              const active = Math.abs(zoomXValue - opt) < 0.25;
              return (
                <Pressable
                  key={opt}
                  onPress={() => setZoomFromMultiplier(opt)}
                  style={[styles.zoomChip, active && styles.zoomChipActive]}
                  accessibilityLabel={`ซูม ${opt}x`}
                  hitSlop={8}
                >
                  <Text style={[styles.zoomChipText, active && styles.zoomChipTextActive]}>{opt}x</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <StatusBar hidden />
    </View>
  );
}

function GalleryScreen({ navigation }: any) {
  const [mediaStatus, setMediaStatus] = useState<MediaLibrary.PermissionStatus | null>(null);
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [pagingCursor, setPagingCursor] = useState<string | undefined>(undefined);
  const [endReached, setEndReached] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const media = await MediaLibrary.requestPermissionsAsync();
      setMediaStatus(media.status);
    })();
  }, []);

  useEffect(() => {
    if (mediaStatus === "granted") refreshGallery();
  }, [mediaStatus]);

  const fetchPage = async (after?: string, replace = false) => {
    if (endReached && !replace) return;
    setLoading(true);
    try {
      const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
      const options: MediaLibrary.AssetsOptions = {
        first: 30,
        mediaType: [MediaLibrary.MediaType.photo],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]] as any,
        album: album?.id,
        after,
      } as any;
      let res = await MediaLibrary.getAssetsAsync(options);
      if (replace && (!res.assets || res.assets.length === 0)) {
        res = await MediaLibrary.getAssetsAsync({
          first: 30,
          mediaType: [MediaLibrary.MediaType.photo],
          sortBy: [[MediaLibrary.SortBy.creationTime, false]] as any,
          after,
        } as any);
      }
      setAssets((prev) => (replace ? res.assets : [...prev, ...res.assets]));
      setPagingCursor(res.endCursor ?? undefined);
      setEndReached(!res.hasNextPage);
    } finally {
      setLoading(false);
    }
  };

  const refreshGallery = async () => {
    setEndReached(false);
    setPagingCursor(undefined);
    await fetchPage(undefined, true);
  };

  const loadMore = async () => {
    if (loading) return;
    await fetchPage(pagingCursor, false);
  };

  if (mediaStatus == null) {
    return (
      <SafeAreaView style={styles.center}>
        <Text>กำลังขอสิทธิ์การใช้งาน...</Text>
      </SafeAreaView>
    );
  }

  if (mediaStatus !== "granted") {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>ต้องการสิทธิ์คลังภาพ</Text>
        <Pressable
          style={styles.button}
          onPress={() => MediaLibrary.requestPermissionsAsync().then((m) => setMediaStatus(m.status))}
        >
          <Text style={styles.buttonText}>อนุญาต</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.galleryContainer}>
        {assets.length === 0 ? (
          <View style={styles.center}>
            {loading ? <ActivityIndicator /> : <Text>ยังไม่มีรูปภาพ ลองถ่ายภาพก่อน</Text>}
          </View>
        ) : (
          <FlatList
            data={assets}
            keyExtractor={(a) => a.id}
            numColumns={3}
            onEndReachedThreshold={0.2}
            onEndReached={loadMore}
            renderItem={({ item }) => (
              <Thumb asset={item} onPress={() => navigation.navigate("Viewer", { assetId: item.id })} />
            )}
            contentContainerStyle={styles.grid}
          />
        )}
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

function ViewerScreen({ route }: any) {
  const { assetId, uri: initialUri } = route.params || {};
  const [uri, setUri] = useState<string | null>(initialUri ?? null);
  const [loading, setLoading] = useState<boolean>(!!assetId && !initialUri);

  useEffect(() => {
    (async () => {
      if (assetId) {
        try {
          const info = await (MediaLibrary.getAssetInfoAsync as any)(assetId, { shouldDownloadFromNetwork: true });
          const next = info?.localUri || info?.uri;
          if (typeof next === "string" && !next.startsWith("ph://")) setUri(next);
        } finally {
          setLoading(false);
        }
      }
    })();
  }, [assetId]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: "#000" }] }>
      <View style={styles.viewerContent}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : uri ? (
          <Image source={{ uri }} style={styles.viewerImage} resizeMode="contain" />
        ) : (
          <Text style={{ color: "#fff" }}>ไม่สามารถแสดงรูปได้</Text>
        )}
      </View>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

function Thumb({ asset, onPress }: { asset: MediaLibrary.Asset; onPress: () => void }) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const resolve = async () => {
      try {
        if (asset.uri.startsWith("ph://")) {
          const info = await (MediaLibrary.getAssetInfoAsync as any)(asset.id, { shouldDownloadFromNetwork: true });
          const next = info?.localUri || info?.uri;
          if (mounted && typeof next === "string" && !next.startsWith("ph://")) setUri(next);
          else if (mounted) setUri(null);
        } else {
          setUri(asset.uri);
        }
      } catch {
        if (mounted) setUri(null);
      }
    };
    resolve();
    return () => {
      mounted = false;
    };
  }, [asset.id]);

  const content = uri ? (
    <Image source={{ uri }} style={styles.thumb} />
  ) : (
    <View style={[styles.thumb, { backgroundColor: "#f3f4f6" }]} />
  );

  return (
    <Pressable onPress={onPress} style={{ width: "33.33%" }}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    marginBottom: 12,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#1f2937",
    borderRadius: 8,
  },
  buttonText: {
    color: "#fff",
  },
  navbar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  tab: {
    flex: 1,
    padding: 12,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#111827",
  },
  tabText: {
    color: "#6b7280",
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#111827",
  },
  cameraContainer: {
    flex: 1,
  },
  cameraRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  cameraTopBar: {
    position: "absolute",
    top: 12,
    left: 0,
    right: 0,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
  },
  flashButton: {
    marginLeft: 16,
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  controls: {
    position: "absolute",
    bottom: 24,
    width: "100%",
    alignItems: "center",
  },
  zoomControls: {
    position: "absolute",
    bottom: 84,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 8,
  },
  zoomBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  zoomTrack: {
    width: 180,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
    overflow: "hidden",
  },
  zoomFill: {
    height: "100%",
    backgroundColor: "#111827",
  },
  zoomHud: {
    position: "absolute",
    top: 16,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  zoomHudText: {
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    fontWeight: "700",
  },
  zoomChips: {
    position: "absolute",
    bottom: 96,
    alignSelf: "center",
    flexDirection: "row",
    gap: 12,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  zoomChip: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomChipActive: {
    backgroundColor: "#fff",
    borderColor: "#fff",
  },
  zoomChipText: {
    color: "#fff",
    fontWeight: "700",
  },
  zoomChipTextActive: {
    color: "#111827",
  },
  flipIcon: {
    position: "absolute",
    right: 24,
    bottom: 8,
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  galleryButton: {
    position: "absolute",
    left: 24,
    bottom: 8,
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  galleryThumb: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },
  shutter: {
    width: 68,
    height: 68,
    backgroundColor: "#fff",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 54,
    height: 54,
    backgroundColor: "#111827",
    borderRadius: 999,
  },
  galleryContainer: {
    flex: 1,
  },
  grid: {
    padding: 2,
  },
  thumb: {
    aspectRatio: 1,
    margin: 2,
  },
  viewerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  viewerImage: {
    width: "100%",
    height: "100%",
  },
});
