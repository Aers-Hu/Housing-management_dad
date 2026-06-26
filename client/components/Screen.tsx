import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ViewStyle,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets, Edge } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

interface ScreenProps {
  children: React.ReactNode;
  backgroundColor?: string;
  statusBarStyle?: 'auto' | 'inverted' | 'light' | 'dark';
  safeAreaEdges?: Edge[];
  style?: ViewStyle;
  scrollable?: boolean;
}

export function Screen({
  children,
  backgroundColor = '#FAFAFA',
  statusBarStyle = 'dark',
  safeAreaEdges = ['top', 'left', 'right', 'bottom'],
  style,
  scrollable = false,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const hasTop = safeAreaEdges.includes('top');
  const hasBottom = safeAreaEdges.includes('bottom');
  const hasLeft = safeAreaEdges.includes('left');
  const hasRight = safeAreaEdges.includes('right');

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor,
    paddingTop: hasTop ? insets.top : 0,
    paddingBottom: hasBottom ? insets.bottom : 0,
    paddingLeft: hasLeft ? insets.left : 0,
    paddingRight: hasRight ? insets.right : 0,
    ...style,
  };

  const innerStyle: ViewStyle = {
    flex: 1,
  };

  const content = scrollable ? (
    <ScrollView
      style={innerStyle}
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="on-drag"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={innerStyle}>{children}</View>
  );

  return (
    <View style={containerStyle}>
      <StatusBar style={statusBarStyle} backgroundColor={backgroundColor} translucent={false} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {content}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
