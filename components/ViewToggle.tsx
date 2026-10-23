import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { VIEW_COOKIE } from "@/lib/data";

async function switchView(form: FormData) {
  "use server";
  const store = await cookies();
  if (form.get("to") === "emp") store.set(VIEW_COOKIE, "emp", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  else store.delete(VIEW_COOKIE);
  redirect("/kalendar");
}

/** Malý prepínač pod menom admina: Admin ↔ pohľad zamestnanca. */
export function ViewToggle({ empView }: { empView: boolean }) {
  return (
    <form action={switchView} className="viewtog">
      <input type="hidden" name="to" value={empView ? "admin" : "emp"} />
      <button
        type="submit"
        role="switch"
        aria-checked={!empView}
        aria-label="Admin"
        title="Admin ON/OFF"
      >
        <span className="vt-track">
          <span className="vt-knob" />
        </span>
      </button>
    </form>
  );
}
