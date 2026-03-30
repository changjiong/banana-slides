"""
Authentication gate tests for generation endpoints.
"""


def test_generate_material_requires_authentication(client):
    response = client.post(
        '/api/projects/none/materials/generate',
        json={'prompt': 'generate a material'},
    )

    assert response.status_code == 401
