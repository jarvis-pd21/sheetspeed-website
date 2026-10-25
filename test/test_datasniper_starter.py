"""The starter workbooks are saved with the task pane visible."""

from pathlib import Path
from zipfile import ZipFile
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]

MAIN_ID = "6f2c1b8a-4e57-4d3a-9b16-8c0e5a7d2f41"
ALT_ID = "3c9d7e21-5a4b-4f8e-8d2c-1b6a0e9f7a52"


def read(package, name):
    with ZipFile(package) as workbook:
        return workbook.read(name)


class StarterWorkbookTest(unittest.TestCase):
    def assert_visible(self, filename, addin_id, other_id):
        path = ROOT / "datasniper" / filename
        self.assertTrue(path.is_file(), filename)
        taskpanes = read(path, "xl/webextensions/taskpanes.xml").decode("utf-8")
        webextension = read(path, "xl/webextensions/webextension1.xml").decode("utf-8")
        self.assertIn('visibility="1"', taskpanes)
        self.assertNotIn('visibility="0"', taskpanes)
        root = ET.fromstring(webextension)
        namespace = {"we": "http://schemas.microsoft.com/office/webextensions/webextension/2010/11"}
        reference = root.find("we:reference", namespace)
        self.assertIsNotNone(reference)
        self.assertEqual(reference.get("id"), addin_id)
        self.assertEqual(reference.get("store"), "developer")
        self.assertEqual(reference.get("storeType"), "Registry")
        shown = [
            item for item in root.findall("we:properties/we:property", namespace)
            if item.get("name") == "Office.AutoShowTaskpaneWithDocument"
        ]
        self.assertEqual([item.get("value") for item in shown], ["true"])
        self.assertNotIn(other_id, webextension)

    def test_main_starter_points_at_the_hosted_addin(self):
        self.assert_visible("DataSniper-Starter.xlsx", MAIN_ID, ALT_ID)

    def test_alt_starter_points_at_the_mirror_addin(self):
        self.assert_visible("DataSniper-Starter-alt.xlsx", ALT_ID, MAIN_ID)


if __name__ == "__main__":
    unittest.main()
