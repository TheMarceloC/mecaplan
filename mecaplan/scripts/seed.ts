import { seedDemo } from "../src/server/repositories/demo";
import { upgradePhaseDemo } from "./phase1b-demo";
seedDemo(true)
  .then(upgradePhaseDemo)
  .then(() =>
    console.log(
      "Datos de demostración 1B restaurados. Los demás usuarios y el proyecto Digit 360 se conservan.",
    ),
  );
