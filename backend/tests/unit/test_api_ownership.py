"""
Ownership and guest-session isolation tests for project and template APIs.
"""

import io

from PIL import Image

from conftest import assert_success_response


def _create_test_image():
    image = Image.new('RGB', (32, 32), color='blue')
    image_bytes = io.BytesIO()
    image.save(image_bytes, format='PNG')
    image_bytes.seek(0)
    return image_bytes


def test_guest_projects_are_isolated_by_session(app):
    client_a = app.test_client()
    client_b = app.test_client()

    create_response = client_a.post(
        '/api/projects',
        json={
            'creation_type': 'idea',
            'idea_prompt': 'guest-a project',
        },
    )
    create_data = assert_success_response(create_response, 201)
    project_id = create_data['data']['project_id']

    assert 'guest_session_id=' in (create_response.headers.get('Set-Cookie') or '')

    own_list_response = client_a.get('/api/projects')
    own_list_data = assert_success_response(own_list_response)
    own_ids = [project['project_id'] for project in own_list_data['data']['projects']]
    assert own_ids == [project_id]

    foreign_list_response = client_b.get('/api/projects')
    foreign_list_data = assert_success_response(foreign_list_response)
    assert foreign_list_data['data']['projects'] == []

    foreign_get_response = client_b.get(f'/api/projects/{project_id}')
    assert foreign_get_response.status_code == 403

    foreign_delete_response = client_b.delete(f'/api/projects/{project_id}')
    assert foreign_delete_response.status_code == 403


def test_guest_user_templates_are_isolated_by_session(app):
    client_a = app.test_client()
    client_b = app.test_client()

    upload_response = client_a.post(
        '/api/user-templates',
        data={
            'name': 'guest template',
            'template_image': (_create_test_image(), 'template.png'),
        },
        content_type='multipart/form-data',
    )
    upload_data = assert_success_response(upload_response)
    template_id = upload_data['data']['template_id']

    assert 'guest_session_id=' in (upload_response.headers.get('Set-Cookie') or '')

    own_list_response = client_a.get('/api/user-templates')
    own_list_data = assert_success_response(own_list_response)
    own_ids = [template['template_id'] for template in own_list_data['data']['templates']]
    assert own_ids == [template_id]

    foreign_list_response = client_b.get('/api/user-templates')
    foreign_list_data = assert_success_response(foreign_list_response)
    assert foreign_list_data['data']['templates'] == []

    foreign_delete_response = client_b.delete(f'/api/user-templates/{template_id}')
    assert foreign_delete_response.status_code == 403


def test_guest_cannot_create_page_on_foreign_project(app):
    client_a = app.test_client()
    client_b = app.test_client()

    create_response = client_a.post(
        '/api/projects',
        json={
            'creation_type': 'idea',
            'idea_prompt': 'protected project',
        },
    )
    create_data = assert_success_response(create_response, 201)
    project_id = create_data['data']['project_id']

    response = client_b.post(
        f'/api/projects/{project_id}/pages',
        json={
            'order_index': 0,
            'outline_content': {
                'title': 'foreign page',
                'points': ['x'],
            },
        },
    )

    assert response.status_code == 403
