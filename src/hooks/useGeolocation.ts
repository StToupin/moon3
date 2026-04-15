import { useEffect, useState } from "react";

export interface GeolocationState {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  loading: boolean;
  error: string | null;
  isDefault: boolean;
}

const DEFAULT_LATITUDE = 48.8566;
const DEFAULT_LONGITUDE = 2.3522;

export function useGeolocation(): GeolocationState {
  const [state, setState] = useState<GeolocationState>({
    latitude: DEFAULT_LATITUDE,
    longitude: DEFAULT_LONGITUDE,
    accuracy: null,
    loading: true,
    error: null,
    isDefault: true,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState((previous) => ({
        ...previous,
        loading: false,
        error: "Geolocation is not supported by your browser",
      }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          loading: false,
          error: null,
          isDefault: false,
        });
      },
      (error) => {
        let errorMessage = "Unknown error getting location";

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location permission denied";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location unavailable";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out";
            break;
        }

        setState((previous) => ({
          ...previous,
          loading: false,
          error: errorMessage,
        }));
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  }, []);

  return state;
}
