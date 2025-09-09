import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
//import for camera permission
import { useCameraPermissions } from "expo-camera";
import { useEffect, useState } from "react";
import * as MediaLibrary from "expo-media-library";

export default function App() {
  //Permission
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasMediaLibraryPermission, requestMediaLibraryPermission] = useState<
    boolean | null
  >(false);
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    const requestPermission = async () => {
      const mediaLibraryStatus = await MediaLibrary.requestPermissionsAsync();
      requestMediaLibraryPermission(mediaLibraryStatus.status === "granted");
    };
    requestPermission();
  }, []);

  if (!cameraPermission) {
    return (
      <View>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!hasMediaLibraryPermission) {
    return (
      <View>
        <Text>Requesting media library permission...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text>Camera App Ready</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
