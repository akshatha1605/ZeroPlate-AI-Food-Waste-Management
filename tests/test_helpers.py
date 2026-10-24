from app.main import parse_json_response, demo_estimate


def test_parse_json_response():
    parsed = parse_json_response('{"estimated_grams": 120, "confidence": 0.6}')
    assert parsed["estimated_grams"] == 120
    assert parsed["confidence"] == 0.6


def test_parse_json_response_code_fence():
    parsed = parse_json_response('```json\n{"dish_name":"Rice"}\n```')
    assert parsed["dish_name"] == "Rice"


def test_demo_estimate_is_marked_demo():
    result = demo_estimate("Rice", b"sample-image-bytes")
    assert result["is_demo"] is True
    assert result["analysis_source"] == "demo"
    assert result["estimated_grams"] > 0
