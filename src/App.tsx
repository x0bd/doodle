import { Head } from "./shell/Head";
import { Readouts } from "./shell/Readouts";
import { Rail } from "./shell/Rail";
import { Bar } from "./shell/Bar";

export function App() {
  return (
    <div className="win">
      <Head />
      <div className="sub" data-tauri-drag-region>
        image generation v3
      </div>
      <Rail />
      <Bar />
      <Readouts />
    </div>
  );
}
