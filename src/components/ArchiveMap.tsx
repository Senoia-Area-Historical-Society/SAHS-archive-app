import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import type { ArchiveItem } from '../types/database';
import { useAuth } from '../contexts/AuthContext';

// Cluster Styles
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';

// Fix for default Leaflet icon inclusion in build environments
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

L.Marker.prototype.options.icon = DefaultIcon;

const createClusterCustomIcon = (cluster: any) => {
    return L.divIcon({
        html: `<div class="flex items-center justify-center w-10 h-10 rounded-full bg-charcoal/90 text-white font-black text-xs shadow-xl border-2 border-tan-light ring-2 ring-charcoal/10 backdrop-blur-sm transition-transform hover:scale-110">
                 <span>${cluster.getChildCount()}</span>
               </div>`,
        className: 'custom-marker-cluster',
        iconSize: L.point(40, 40, true),
    });
};

interface ArchiveMapProps {
    items: ArchiveItem[];
}

export function ArchiveMap({ items }: ArchiveMapProps) {
    const { isEditingMode } = useAuth();
    
    // Filter items that have valid coordinates
    const mapItems = items.filter(item => 
        item.coordinates && 
        typeof item.coordinates.lat === 'number' && 
        typeof item.coordinates.lng === 'number'
    );

    const senioaCenter: [number, number] = [33.3001, -84.5544];

    return (
        <div className="w-full h-[600px] rounded-2xl border border-tan-light overflow-hidden shadow-sm bg-cream/20 relative z-0">
            <MapContainer 
                center={senioaCenter} 
                zoom={15} 
                scrollWheelZoom={true}
                dragging={true}
                doubleClickZoom={true}
                className="w-full h-full"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MarkerClusterGroup
                    chunkedLoading
                    iconCreateFunction={createClusterCustomIcon}
                    maxClusterRadius={50}
                    spiderfyOnMaxZoom={true}
                >
                    {mapItems.map((item) => (
                        <Marker 
                            key={item.id} 
                            position={[item.coordinates!.lat, item.coordinates!.lng]}
                        >
                            <Popup>
                                <div className="p-1 max-w-[200px]">
                                    {item.featured_image_url && (
                                        <img 
                                            src={item.featured_image_url} 
                                            alt={item.title} 
                                            className="w-full h-24 object-cover rounded-lg mb-2 border border-tan-light/50"
                                        />
                                    )}
                                    <h4 className="font-serif font-bold text-charcoal mb-1 text-sm leading-tight">{item.title || item.org_name}</h4>
                                    <p className="text-[10px] text-charcoal/60 mb-2 line-clamp-2 leading-snug">{item.description}</p>
                                    <Link 
                                        to={isEditingMode ? `/edit-item/${item.id}` : `/items/${item.id}`}
                                        className="inline-block w-full py-1 bg-tan text-white text-center text-[10px] font-bold rounded hover:bg-charcoal transition-colors no-underline"
                                    >
                                        {isEditingMode ? 'Edit Item' : 'View Details'}
                                    </Link>
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MarkerClusterGroup>
            </MapContainer>
        </div>
    );
}
