"use client";

import { subscribeToPush } from "@/lib/pushNotifications";
import { backendUrl } from "@/lib/configENV";

export default function PushTest() {
  const handleEnable = async () => {
    try {
      const subscription = await subscribeToPush();

      const token = localStorage.getItem("authToken");

      const response = await fetch(
        `${backendUrl}/api/notifications/push/subscribe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(subscription),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to save subscription: ${error}`);
      }

      console.log("Push subscription saved to backend");

      console.log("SUCCESS! Push subscription:", subscription);
    } catch (error) {
      console.error("Push setup failed:", error);
    }
  };

  return <button onClick={handleEnable}>Enable Notifications</button>;
}
