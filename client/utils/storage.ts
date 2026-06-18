import AsyncStorage from '@react-native-async-storage/async-storage';
import { Room, generateAllRooms } from './roomTypes';

const STORAGE_KEY = 'house_rooms_data';

export const StorageService = {
  // 保存房间数据
  async saveRooms(rooms: Room[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
    } catch (error) {
      console.error('Failed to save rooms:', error);
    }
  },

  // 加载房间数据
  async loadRooms(): Promise<Room[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
      // 首次使用，生成默认数据
      const defaultRooms = generateAllRooms();
      await this.saveRooms(defaultRooms);
      return defaultRooms;
    } catch (error) {
      console.error('Failed to load rooms:', error);
      return generateAllRooms();
    }
  },

  // 更新单个房间
  async updateRoom(updatedRoom: Room): Promise<Room[]> {
    const rooms = await this.loadRooms();
    const index = rooms.findIndex(r => r.id === updatedRoom.id);
    if (index !== -1) {
      rooms[index] = updatedRoom;
      await this.saveRooms(rooms);
    }
    return rooms;
  },

  // 重置所有数据
  async resetData(): Promise<Room[]> {
    const defaultRooms = generateAllRooms();
    await this.saveRooms(defaultRooms);
    return defaultRooms;
  },
};
