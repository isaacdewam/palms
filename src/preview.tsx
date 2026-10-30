// temporary: renders the sync board with sample covers, delete with preview.html
import ReactDOM from "react-dom/client";
import { Backdrop } from "@/components/backdrop";
import { SyncingCovers } from "@/components/syncing-covers";
import "./index.css";

const covers = [11, 22, 33, 44].map((n, k) => ({
  id: String(n),
  cover: `https://picsum.photos/seed/${n}/300`,
  done: k < 2,
  slot: k + 18,
}));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <div className="isolate min-h-screen text-white">
    <Backdrop plain />
    <div className="h-16" />
    <main className="mx-auto max-w-6xl px-6 py-6">
    <SyncingCovers
      covers={covers}
      synced={20}
      failed={0}
      total={38}
      current={[{ title: "Thot", artist: "x" }, { title: "HARDROCK // ATHOME", artist: "y" }]}
    />
    </main>
  </div>,
);
