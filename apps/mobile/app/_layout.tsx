import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { colors } from '@vardenia/tokens'

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.ink[950] },
          headerTintColor: colors.gold[300],
          contentStyle: { backgroundColor: colors.surface.base },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Vardenia' }} />
      </Stack>
    </>
  )
}
