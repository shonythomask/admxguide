import os
import json
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

# =========================================================
# PATHS
# =========================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ADMX_DIR = os.path.join(BASE_DIR, "admx")
ADML_DIR = os.path.join(BASE_DIR, "adml", "en-US")

OUTPUT_DIR = os.path.join(BASE_DIR, "website", "data", "office")
os.makedirs(OUTPUT_DIR, exist_ok=True)

POLICIES_FILE = os.path.join(OUTPUT_DIR, "policies.json")
METADATA_FILE = os.path.join(OUTPUT_DIR, "metadata.json")

# =========================================================
# LOAD ADML STRINGS
# =========================================================
def load_adml_strings():
    strings = {}
    for file in os.listdir(ADML_DIR):
        if not file.endswith(".adml"):
            continue

        tree = ET.parse(os.path.join(ADML_DIR, file))
        root = tree.getroot()

        for s in root.findall(".//{*}string"):
            sid = s.attrib.get("id")
            if sid:
                strings[sid] = s.text or ""

    print(f"Loaded {len(strings)} ADML strings")
    return strings


ADML_STRINGS = load_adml_strings()

# =========================================================
# HELPERS
# =========================================================
def resolve_string(ref):
    if not ref:
        return ""
    if ref.startswith("$(string."):
        key = ref.replace("$(string.", "").replace(")", "")
        return ADML_STRINGS.get(key, "")
    return ref


def hive_from_class(policy_class):
    return "HKCU" if policy_class == "User" else "HKLM"


def resolve_registry_key(policy, elements):
    for elem in elements:
        if "key" in elem.attrib:
            return elem.attrib.get("key")
    return policy.attrib.get("key")


def extract_enabled_disabled(policy):
    enabled = None
    disabled = None

    en = policy.find(".//{*}enabledValue")
    dis = policy.find(".//{*}disabledValue")

    if en is not None:
        d = en.find(".//{*}decimal")
        if d is not None and "value" in d.attrib:
            enabled = int(d.attrib["value"])

    if dis is not None:
        d = dis.find(".//{*}decimal")
        if d is not None and "value" in d.attrib:
            disabled = int(d.attrib["value"])

    return enabled, disabled


def normalize_office_settings_key(registry_key, policy_id, value_name):
    if (
        registry_key
        and registry_key.lower().endswith("\\settings")
        and value_name is None
    ):
        clean_policy = policy_id.replace("L_", "")
        return (
            registry_key.rstrip("\\") + "\\" + clean_policy,
            "Enabled"
        )
    return registry_key, value_name


# =========================================================
# PARSE ADMX FILES
# =========================================================
policies = []

for admx_file in os.listdir(ADMX_DIR):
    if not admx_file.endswith(".admx"):
        continue

    tree = ET.parse(os.path.join(ADMX_DIR, admx_file))
    root = tree.getroot()

    # -----------------------------------------------------
    # CATEGORIES
    # -----------------------------------------------------
    categories = {}

    for cat in root.findall(".//{*}category"):
        cid = cat.attrib.get("name")
        display_name = resolve_string(cat.attrib.get("displayName"))

        parent = cat.find(".//{*}parentCategory")
        parent_ref = parent.attrib["ref"] if parent is not None else None

        categories[cid] = {
            "displayName": display_name or cid,
            "parent": parent_ref
        }

    def resolve_category_path(cid):
        path = []
        while cid and cid in categories:
            path.insert(0, categories[cid]["displayName"])
            cid = categories[cid]["parent"]
        return path

    # -----------------------------------------------------
    # POLICIES
    # -----------------------------------------------------
    for policy in root.findall(".//{*}policy"):
        policy_id = policy.attrib.get("name")
        policy_class = policy.attrib.get("class")

        display_name = resolve_string(policy.attrib.get("displayName"))
        description = resolve_string(policy.attrib.get("explainText"))

        cat_ref = policy.find(".//{*}parentCategory")
        category_path = resolve_category_path(cat_ref.attrib["ref"]) if cat_ref is not None else []

        category_path = [
            "User Configuration" if policy_class == "User" else "Computer Configuration",
            "Administrative Templates"
        ] + category_path

        registry_hive = hive_from_class(policy_class)

        elements_node = policy.find(".//{*}elements")
        elements = list(elements_node) if elements_node is not None else []

        registry_key = resolve_registry_key(policy, elements)

        simple_value_name = None
        per_app_values = {}
        current_app = None

        for elem in elements:
            tag = elem.tag.split("}")[-1]

            if tag == "boolean":
                current_app = elem.attrib.get("valueName")

            elif tag == "decimal" and current_app:
                raw_val = elem.attrib.get("value")
                if raw_val is None:
                    continue

                val = int(raw_val)
                per_app_values.setdefault(current_app, {})

                if "enabled" not in per_app_values[current_app]:
                    per_app_values[current_app]["enabled"] = val
                else:
                    per_app_values[current_app]["disabled"] = val

        if not per_app_values:
            for elem in elements:
                if elem.tag.split("}")[-1] in ("boolean", "decimal"):
                    simple_value_name = elem.attrib.get("valueName")
                    break

        enabled_val, disabled_val = extract_enabled_disabled(policy)

        registry_key, simple_value_name = normalize_office_settings_key(
            registry_key,
            policy_id,
            simple_value_name
        )

        policy_obj = {
            "policyId": policy_id,
            "displayName": display_name,
            "description": description,
            "policyClass": policy_class,
            "registryHive": registry_hive,
            "categoryPath": category_path,
            "product": admx_file.replace(".admx", ""),
            "sourceAdmx": admx_file
        }

        if registry_key:
            if per_app_values:
                policy_obj["registry"] = {
                    "hive": registry_hive,
                    "key": registry_key,
                    "perApp": per_app_values
                }
            else:
                policy_obj["registry"] = {
                    "hive": registry_hive,
                    "key": registry_key,
                    "valueName": simple_value_name,
                    "type": "DWORD",
                    "enabledValue": enabled_val if enabled_val is not None else 1,
                    "disabledValue": disabled_val if disabled_val is not None else 0
                }

        policies.append(policy_obj)

print(f"Parsed {len(policies)} policies")

# =========================================================
# METADATA
# =========================================================
metadata = {
    "appId": "office",
    "displayName": "Microsoft Office",
    "vendor": "Microsoft",
    "lastUpdated": datetime.now(timezone.utc).isoformat(),
    "policyCount": len(policies),
    "configurationScopes": {"User": 0, "Machine": 0},
    "products": {}
}

for p in policies:
    metadata["configurationScopes"][p["policyClass"]] += 1
    metadata["products"].setdefault(p["product"], 0)
    metadata["products"][p["product"]] += 1

# =========================================================
# EXPORT
# =========================================================
with open(POLICIES_FILE, "w", encoding="utf-8") as f:
    json.dump({
        "appId": "office",
        "displayName": "Microsoft Office",
        "vendor": "Microsoft",
        "policyCount": len(policies),
        "policies": policies
    }, f, indent=2)

with open(METADATA_FILE, "w", encoding="utf-8") as f:
    json.dump(metadata, f, indent=2)

print(f"Exported policies to {POLICIES_FILE}")
print(f"Exported metadata to {METADATA_FILE}")
