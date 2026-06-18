import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { StorageService } from '@/utils/storage';
import { Room, groupRoomsByFloor } from '@/utils/roomTypes';
import { useFocusEffect } from 'expo-router';

export default function HomeScreen() {
  const router = useSafeRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ total: 0, occupied: 0, vacant: 0 });

  const loadRooms = useCallback(async () => {
    const data = await StorageService.loadRooms();
    setRooms(data);
    const occupied = data.filter(r => r.isOccupied).length;
    setStats({
      total: data.length,
      occupied,
      vacant: data.length - occupied,
    });
  }, []);

  // 页面获得焦点时刷新数据
  useFocusEffect(
    useCallback(() => {
      loadRooms();
    }, [loadRooms])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRooms();
    setRefreshing(false);
  };

  const groupedRooms = groupRoomsByFloor(rooms);
  const floors = [6, 5, 4, 3, 2]; // 从高到低显示

  const handleRoomPress = (roomId: string) => {
    router.push('/room', { id: roomId });
  };

  return (
    <Screen>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 统计卡片 */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>总房间</Text>
          </View>
          <View style={[styles.statCard, styles.occupiedCard]}>
            <Text style={[styles.statNumber, styles.occupiedNumber]}>{stats.occupied}</Text>
            <Text style={styles.statLabel}>已入住</Text>
          </View>
          <View style={[styles.statCard, styles.vacantCard]}>
            <Text style={[styles.statNumber, styles.vacantNumber]}>{stats.vacant}</Text>
            <Text style={styles.statLabel}>空房间</Text>
          </View>
        </View>

        {/* 楼层列表 */}
        {floors.map((floor) => {
          const floorRooms = groupedRooms.get(floor) || [];
          return (
            <View key={floor} style={styles.floorSection}>
              <View style={styles.floorHeader}>
                <View style={styles.floorBadge}>
                  <Text style={styles.floorBadgeText}>{floor}楼</Text>
                </View>
                <Text style={styles.floorInfo}>
                  {floorRooms.filter(r => r.isOccupied).length}/{floorRooms.length} 已入住
                </Text>
              </View>

              <View style={styles.roomsGrid}>
                {floorRooms.map((room) => (
                  <TouchableOpacity
                    key={room.id}
                    style={[
                      styles.roomCard,
                      room.isOccupied && styles.roomCardOccupied,
                    ]}
                    onPress={() => handleRoomPress(room.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.roomNumber,
                        room.isOccupied && styles.roomNumberOccupied,
                      ]}
                    >
                      {room.number}
                    </Text>
                    <View
                      style={[
                        styles.statusDot,
                        room.isOccupied ? styles.statusDotOccupied : styles.statusDotVacant,
                      ]}
                    />
                    <Text
                      style={[
                        styles.tenantName,
                        room.isOccupied && styles.tenantNameOccupied,
                      ]}
                      numberOfLines={1}
                    >
                      {room.isOccupied ? room.tenantName || '已入住' : '空置'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  // 统计卡片
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#F0F0F3',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  occupiedCard: {
    backgroundColor: '#F0F0F3',
  },
  vacantCard: {
    backgroundColor: '#F0F0F3',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2D3436',
  },
  occupiedNumber: {
    color: '#00B894',
  },
  vacantNumber: {
    color: '#6C63FF',
  },
  statLabel: {
    fontSize: 12,
    color: '#636E72',
    marginTop: 4,
  },
  // 楼层区块
  floorSection: {
    marginBottom: 20,
  },
  floorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  floorBadge: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  floorBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  floorInfo: {
    fontSize: 13,
    color: '#636E72',
  },
  // 房间网格
  roomsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  roomCard: {
    width: '31%',
    backgroundColor: '#F0F0F3',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  roomCardOccupied: {
    backgroundColor: '#E8F8F5',
  },
  roomNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2D3436',
  },
  roomNumberOccupied: {
    color: '#00B894',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginVertical: 6,
  },
  statusDotOccupied: {
    backgroundColor: '#00B894',
  },
  statusDotVacant: {
    backgroundColor: '#B2BEC3',
  },
  tenantName: {
    fontSize: 11,
    color: '#636E72',
    textAlign: 'center',
  },
  tenantNameOccupied: {
    color: '#00B894',
  },
  bottomPadding: {
    height: 40,
  },
});
