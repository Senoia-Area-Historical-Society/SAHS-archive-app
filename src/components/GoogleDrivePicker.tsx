import { useEffect, useState, useCallback } from 'react';
import { HardDrive } from 'lucide-react';

interface GoogleDrivePickerProps {
    onFilesSelected: (files: File[]) => void;
    onError: (error: string) => void;
}

declare global {
    interface Window {
        google: any;
        gapi: any;
    }
}

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID;

// Scopes required for picking files and downloading them
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

export function GoogleDrivePicker({ onFilesSelected, onError }: GoogleDrivePickerProps) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [tokenClient, setTokenClient] = useState<any>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);

    // 1. Load Google API and GIS client scripts
    useEffect(() => {
        const loadScripts = async () => {
            const loadScript = (src: string) => {
                return new Promise((resolve) => {
                    const script = document.createElement('script');
                    script.src = src;
                    script.async = true;
                    script.defer = true;
                    script.onload = resolve;
                    document.body.appendChild(script);
                });
            };

            await Promise.all([
                loadScript('https://apis.google.com/js/api.js'),
                loadScript('https://accounts.google.com/gsi/client')
            ]);

            // Initialize components
            window.gapi.load('picker', () => {
                setIsLoaded(true);
            });

            const client = window.google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (response: any) => {
                    if (response.error !== undefined) {
                        onError(response.error);
                        return;
                    }
                    setAccessToken(response.access_token);
                    createPicker(response.access_token);
                },
            });
            setTokenClient(client);
        };

        loadScripts();
    }, [onError]);

    // 2. Function to fetch file content and convert to local File object
    const downloadFile = useCallback(async (fileId: string, fileName: string, mimeType: string, token: string) => {
        try {
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!response.ok) throw new Error('Failed to download file from Google Drive');

            const blob = await response.blob();
            return new File([blob], fileName, { type: mimeType });
        } catch (error) {
            console.error('Error downloading file:', error);
            throw error;
        }
    }, []);

    // 3. Create and open the Picker
    const createPicker = useCallback((token: string) => {
        const pickerCallback = async (data: any) => {
            if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
                const documents = data[window.google.picker.Response.DOCUMENTS];
                const filesToUpload: File[] = [];

                for (const doc of documents) {
                    const fileId = doc[window.google.picker.Document.ID];
                    const fileName = doc[window.google.picker.Document.NAME];
                    const mimeType = doc[window.google.picker.Document.MIME_TYPE];
                    
                    try {
                        const file = await downloadFile(fileId, fileName, mimeType, token);
                        filesToUpload.push(file);
                    } catch (err) {
                        onError(`Failed to download ${fileName}`);
                    }
                }

                if (filesToUpload.length > 0) {
                    onFilesSelected(filesToUpload);
                }
            }
        };

        const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
            .setMimeTypes('image/png,image/jpeg,image/webp,application/pdf')
            .setIncludeFolders(true)
            .setEnableDrives(true);

        const picker = new window.google.picker.PickerBuilder()
            .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
            .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
            .enableFeature(window.google.picker.Feature.SUPPORT_TEAM_DRIVES)
            .setDeveloperKey(API_KEY)
            .setAppId(APP_ID)
            .setOAuthToken(token)
            .addView(view)
            .addView(new window.google.picker.DocsUploadView())
            .setCallback(pickerCallback)
            .build();
        picker.setVisible(true);
    }, [downloadFile, onFilesSelected, onError]);

    const handleOpenPicker = () => {
        if (!isLoaded || !tokenClient) {
            onError('Google Drive picker is still loading...');
            return;
        }

        // Check if we need to request a new token or if we can reuse the existing one
        if (accessToken) {
            createPicker(accessToken);
        } else {
            tokenClient.requestAccessToken({ prompt: '' });
        }
    };

    return (
        <button
            type="button"
            onClick={handleOpenPicker}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-tan-light/50 text-charcoal rounded-xl font-bold text-sm hover:bg-cream transition-all shadow-sm group"
            title="Import from Google Drive"
        >
            <HardDrive size={18} className="text-tan group-hover:scale-110 transition-transform" />
            <span>Google Drive</span>
        </button>
    );
}
