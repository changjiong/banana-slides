"""
Task manager credit-deduction tests.
"""

from unittest.mock import MagicMock

from models import db, Material, Task, User
from services.task_manager import generate_material_image_task


def test_generate_material_image_task_deducts_credits(app):
    with app.app_context():
        user = User(
            username='credits-user',
            email='credits@example.com',
            password_hash='hash',
            credits=50,
        )
        task = Task(
            project_id='global',
            task_type='GENERATE_MATERIAL',
            status='PENDING',
        )
        db.session.add_all([user, task])
        db.session.commit()

        ai_service = MagicMock()
        ai_service.generate_image.return_value = object()

        file_service = MagicMock()
        file_service.save_material_image.return_value = 'materials/generated.png'
        file_service.get_file_url.return_value = '/files/materials/generated.png'

        generate_material_image_task(
            task.id,
            'global',
            'make a material',
            ai_service,
            file_service,
            app=app,
            user_id=user.id,
        )

        db.session.refresh(user)
        db.session.refresh(task)
        material = Material.query.one()

        assert task.status == 'COMPLETED'
        assert material.url == '/files/materials/generated.png'
        assert user.credits == 40
