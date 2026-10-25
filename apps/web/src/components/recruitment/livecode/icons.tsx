/**
 * The kit icon names a Live Coding topic carries (`rec_lc_topic.icon`) as
 * Phosphor icons. An unknown name falls back to the chip.
 */
import {
  BluetoothIcon,
  CpuIcon,
  DoorIcon,
  GlobeIcon,
  HashIcon,
  LightbulbIcon,
  PlugsConnectedIcon,
  SlidersHorizontalIcon,
  ThermometerIcon,
  TrafficSignalIcon,
  LightningIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { Protocol } from "../../../lib/recruitment/exam-types";

const MAP: Record<string, () => ReactNode> = {
  lamp: () => <LightbulbIcon />,
  thermometer: () => <ThermometerIcon />,
  sliders: () => <SlidersHorizontalIcon />,
  door: () => <DoorIcon />,
  counter: () => <HashIcon />,
  traffic: () => <TrafficSignalIcon />,
  bolt: () => <LightningIcon />,
  chip: () => <CpuIcon />,
};

export const TopicIcon = ({ name }: { name: string }) => <>{(MAP[name] ?? MAP.chip)()}</>;
export const topicIconNames = Object.keys(MAP);

export const ProtocolIcon = ({ p }: { p: Protocol }) =>
  p === "ble" ? <BluetoothIcon /> : p === "mqtt" ? <PlugsConnectedIcon /> : <GlobeIcon />;
