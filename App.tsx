import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as MediaLibrary from "expo-media-library";

type Screen = "camera" | "gallery";

const ALBUM_NAME = "Camera App";

export default function App() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaStatus, setMediaStatus] = useState<MediaLibrary.PermissionStatus | null>(null);
  const [screen, setScreen] = useState<Screen>("camera");
  const [loading, setLoading] = useState(false);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  // Photos state for gallery
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [endReached, setEndReached] = useState(false);
  const [pagingCursor, setPagingCursor] = useState<string | undefined>(undefined);

  useEffect(() => {
    const askPermissions = async () => {
      // camera handled by useCameraPermissions
      const media = await MediaLibrary.requestPermissionsAsync();
      setMediaStatus(media.status);
      if (!cameraPermission) await requestCameraPermission();
    };
    askPermissions();
  }, []);

  useEffect(() => {
    if (screen === "gallery") {
      // refresh assets when entering gallery
      refreshGallery();
    }
  }, [screen]);

  const ensureAlbum = async (
    firstAsset?: MediaLibrary.Asset
  ): Promise<MediaLibrary.Album | null> => {
    try {
      const existing = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
      if (existing) return existing;
      if (firstAsset) {
        return await MediaLibrary.createAlbumAsync(ALBUM_NAME, firstAsset, false);
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const takePhoto = async () => {
    try {
      if (!cameraRef.current) return;
      setLoading(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: true,
      });

      if (!photo?.uri) throw new Error("No photo URI");

      // Save to library and album
      const asset = await MediaLibrary.createAssetAsync(photo.uri);
      const album = await ensureAlbum(asset);
      if (album) {
        try {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album.id, false);
        } catch {
          // ignore if already in album
        }
      }

      Alert.alert("บันทึกแล้ว", "ภาพถูกบันทึกในแกลเลอรี");
    } catch (e: any) {
      Alert.alert("เกิดข้อผิดพลาด", e?.message ?? "ไม่สามารถถ่ายภาพได้");
    } finally {
      setLoading(false);
    }
  };

  const resolveAssetUri = async (asset: MediaLibrary.Asset): Promise<string | null> => {
    try {
      if (asset.uri.startsWith("ph://")) {
        const info = await (MediaLibrary.getAssetInfoAsync as any)(asset.id, {
          shouldDownloadFromNetwork: true,
        });
        const next = info?.localUri || info?.uri;
        if (typeof next === "string" && !next.startsWith("ph://")) return next;
        return null;
      }
      return asset.uri;
    } catch {
      return null;
    }
  };

  const openViewer = async (asset: MediaLibrary.Asset) => {
    setViewerLoading(true);
    setViewerVisible(true);
    const uri = await resolveAssetUri(asset);
    setViewerUri(uri);
    setViewerLoading(false);
  };

  const fetchPage = async (after?: string, replace = false) => {
    if (endReached && !replace) return;
    setGalleryLoading(true);
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
      // Fallback to all photos if album fetch yields zero on first load
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
    } catch (e) {
      // Try general fetch if album failed
      try {
        const res = await MediaLibrary.getAssetsAsync({
          first: 30,
          mediaType: [MediaLibrary.MediaType.photo],
          sortBy: [[MediaLibrary.SortBy.creationTime, false]] as any,
          after,
        } as any);
        setAssets((prev) => (replace ? res.assets : [...prev, ...res.assets]));
        setPagingCursor(res.endCursor ?? undefined);
        setEndReached(!res.hasNextPage);
      } catch {
        if (replace) setAssets([]);
      }
    } finally {
      setGalleryLoading(false);
    }
  };

  const refreshGallery = async () => {
    setEndReached(false);
    setPagingCursor(undefined);
    await fetchPage(undefined, true);
  };

  const loadMore = async () => {
    if (galleryLoading) return;
    await fetchPage(pagingCursor, false);
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
        <Pressable style={styles.button} onPress={() => {
          requestCameraPermission();
          MediaLibrary.requestPermissionsAsync().then((m) => setMediaStatus(m.status));
        }}>
          <Text style={styles.buttonText}>อนุญาต</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navbar}>
        <Pressable
          style={[styles.tab, screen === "camera" && styles.tabActive]}
          onPress={() => setScreen("camera")}
        >
          <Text style={[styles.tabText, screen === "camera" && styles.tabTextActive]}>ถ่ายภาพ</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, screen === "gallery" && styles.tabActive]}
          onPress={() => setScreen("gallery")}
        >
          <Text style={[styles.tabText, screen === "gallery" && styles.tabTextActive]}>แกลเลอรี</Text>
        </Pressable>
      </View>

      {screen === "camera" ? (
        <View style={styles.cameraContainer}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back" />
          <View style={styles.controls}>
            <Pressable style={styles.shutter} onPress={takePhoto} disabled={loading}>
              {loading ? <ActivityIndicator color="#000" /> : <View style={styles.shutterInner} />}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.galleryContainer}>
          {assets.length === 0 ? (
            <View style={styles.center}>
              {galleryLoading ? (
                <ActivityIndicator />
              ) : (
                <Text>ยังไม่มีรูปภาพ ลองถ่ายภาพก่อน</Text>
              )}
            </View>
          ) : (
            <FlatList
              data={assets}
              keyExtractor={(a) => a.id}
              numColumns={3}
              onEndReachedThreshold={0.2}
              onEndReached={loadMore}
              renderItem={({ item }) => <Thumb asset={item} onPress={() => openViewer(item)} />}
              contentContainerStyle={styles.grid}
            />
          )}
        </View>
      )}
      <Modal visible={viewerVisible} onRequestClose={() => setViewerVisible(false)} animationType="fade">
        <SafeAreaView style={styles.viewerRoot}>
          <Pressable style={styles.viewerBackdrop} onPress={() => setViewerVisible(false)} />
          <View style={styles.viewerContent}>
            {viewerLoading ? (
              <ActivityIndicator color="#fff" />
            ) : viewerUri ? (
              <Image source={{ uri: viewerUri }} style={styles.viewerImage} resizeMode="contain" />
            ) : (
              <Text style={{ color: "#fff" }}>ไม่สามารถแสดงรูปได้</Text>
            )}
          </View>
          <View style={styles.viewerHeader} pointerEvents="box-none">
            <Pressable
              style={styles.viewerBack}
              onPress={() => setViewerVisible(false)}
              hitSlop={30}
              accessibilityRole="button"
              accessibilityLabel="กลับ"
            >
              <Text style={styles.viewerBackText}>‹ กลับ</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
      <StatusBar style="auto" />
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
          const info = await (MediaLibrary.getAssetInfoAsync as any)(asset.id, {
            shouldDownloadFromNetwork: true,
          });
          const next = info?.localUri || info?.uri;
          if (mounted && typeof next === "string" && !next.startsWith("ph://")) {
            setUri(next);
          } else if (mounted) {
            setUri(null); // keep placeholder if still ph://
          }
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
  camera: {
    flex: 1,
  },
  controls: {
    position: "absolute",
    bottom: 24,
    width: "100%",
    alignItems: "center",
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
  viewerRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  viewerHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 200,
  },
  viewerBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  viewerBack: {
    marginLeft: 8,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 999,
  },
  viewerBackText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
